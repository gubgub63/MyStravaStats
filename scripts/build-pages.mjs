import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const build = join(root, '.pages-build');
const basePath = process.env.PAGES_BASE_PATH ?? '/MyStravaStats';
if (basePath && !/^\/[\w.-]+$/.test(basePath)) {
  throw new Error('PAGES_BASE_PATH must be empty or a single /repository path.');
}

// Only copy the public UI and calculations. No environment files, proxy or API routes.
await rm(build, { recursive: true, force: true });
await mkdir(join(build, 'src/app'), { recursive: true });
for (const file of ['package.json', 'tsconfig.json', 'postcss.config.mjs', 'next-env.d.ts']) {
  await cp(join(root, file), join(build, file));
}
for (const directory of ['components', 'lib']) {
  await cp(join(root, 'src', directory), join(build, 'src', directory), {
    recursive: true,
  });
}
for (const file of ['globals.css', 'icon.svg']) {
  await cp(join(root, 'src/app', file), join(build, 'src/app', file));
}
await cp(join(root, 'scripts/pages-template/app'), join(build, 'src/app'), { recursive: true });
await mkdir(join(build, 'src/app/demo'), { recursive: true });
await writeFile(
  join(build, 'src/app/demo/page.tsx'),
  "export { default } from '../page';\nexport const metadata = { title: 'Aperçu interactif' };\n",
);
await symlink(join(root, 'node_modules'), join(build, 'node_modules'), 'junction');
await writeFile(
  join(build, 'next.config.mjs'),
  `export default ${JSON.stringify({
    output: 'export',
    basePath,
    trailingSlash: true,
    poweredByHeader: false,
    images: { unoptimized: true },
    turbopack: { root },
  })};\n`,
);

const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
for (const name of Object.keys(environment)) {
  if (name.startsWith('STRAVA_') || name === 'SESSION_SECRET' || name === 'NEXT_PUBLIC_APP_URL') {
    delete environment[name];
  }
}
const result = spawnSync(
  process.execPath,
  [join(root, 'node_modules/next/dist/bin/next'), 'build', build],
  { cwd: build, env: environment, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await writeFile(join(build, 'out/.nojekyll'), '');
console.log(`Public preview exported to ${join(build, 'out')}`);
