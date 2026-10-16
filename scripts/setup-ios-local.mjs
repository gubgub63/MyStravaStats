import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { localOrigin } from './ios-network.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !args[0].startsWith('--host=')))
  throw new Error('Utilisation : npm run ios:setup -- --host=ADRESSE_IP_PRIVEE');
const selectedOrigin = args.length ? localOrigin(args[0].slice('--host='.length)) : undefined;
const root = new URL('../', import.meta.url);
const appFile = new URL('.env.ios.local', root),
  dbFile = new URL('.env.ios-db.local', root);
async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function command(args) {
  const result = spawnSync('docker', args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Docker doit être démarré.');
  return result.stdout.trim();
}
const appExists = await exists(appFile),
  dbExists = await exists(dbFile);
if (appExists !== dbExists)
  throw new Error(
    'Configuration locale incomplète. Conserve les fichiers existants et vérifie .env.ios.local et .env.ios-db.local.',
  );
if (!appExists) {
  const original = parseEnv(await readFile(new URL('.env.local', root), 'utf8'));
  const secret = randomBytes(32).toString('hex');
  const values = {
    STRAVA_CLIENT_ID: original.STRAVA_CLIENT_ID ?? '',
    STRAVA_CLIENT_SECRET: original.STRAVA_CLIENT_SECRET ?? '',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    STRAVA_REDIRECT_URI: `${selectedOrigin ?? localOrigin('localhost')}/api/auth/strava/callback`,
    NEXT_PUBLIC_APP_URL: selectedOrigin ?? localOrigin('localhost'),
    DATABASE_URL: `postgresql://mystats:${secret}@127.0.0.1:55440/mystats`,
    MYSTATS_DIST_DIR: '.next-ios',
    MYSTATS_COOKIE_NAMESPACE: 'ios-local',
  };
  function envText(entries) {
    return (
      Object.entries(entries)
        .map(([k, v]) => {
          if (/["\\\r\n]/.test(v))
            throw new Error(
              'Une valeur de configuration ne peut pas être copiée dans le fichier local.',
            );
          return `${k}="${v}"`;
        })
        .join('\n') + '\n'
    );
  }
  await writeFile(appFile, envText(values), { mode: 0o600, flag: 'wx' });
  await writeFile(
    dbFile,
    `POSTGRES_USER=mystats\nPOSTGRES_DB=mystats\nPOSTGRES_PASSWORD=${secret}\n`,
    { mode: 0o600, flag: 'wx' },
  );
}
if (appExists && selectedOrigin) {
  let config = await readFile(appFile, 'utf8');
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_APP_URL: selectedOrigin,
    STRAVA_REDIRECT_URI: `${selectedOrigin}/api/auth/strava/callback`,
  })) {
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    config = pattern.test(config)
      ? config.replace(pattern, line)
      : `${config.trimEnd()}\n${line}\n`;
  }
  await writeFile(appFile, config, { mode: 0o600 });
}
const inspect = spawnSync(
  'docker',
  ['inspect', '--format', '{{index .Config.Labels "org.mystats.role"}}', 'mystats-ios-local'],
  { encoding: 'utf8' },
);
if (inspect.status === 0) {
  if (inspect.stdout.trim() !== 'ios-local')
    throw new Error('Le nom mystats-ios-local est déjà utilisé par un autre conteneur.');
  command(['start', 'mystats-ios-local']);
} else
  command([
    'run',
    '-d',
    '--name',
    'mystats-ios-local',
    '--label',
    'org.mystats.role=ios-local',
    '--restart',
    'unless-stopped',
    '--env-file',
    dbFile.pathname,
    '-p',
    '127.0.0.1:55440:5432',
    '-v',
    'mystats_ios_local_data:/var/lib/postgresql/data',
    'postgres:16-alpine',
  ]);
for (let attempt = 0; attempt < 30; attempt++) {
  if (
    spawnSync('docker', ['exec', 'mystats-ios-local', 'pg_isready', '-U', 'mystats'], {
      stdio: 'ignore',
    }).status === 0
  )
    break;
  if (attempt === 29)
    throw new Error('PostgreSQL ne répond pas encore. Vérifie le conteneur mystats-ios-local.');
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const migration = spawnSync(process.execPath, ['scripts/db/migrate.mjs'], {
  cwd: root,
  env: { ...process.env, ...parseEnv(await readFile(appFile, 'utf8')) },
  stdio: 'inherit',
});
if (migration.status !== 0) process.exit(migration.status ?? 1);
const origin = parseEnv(await readFile(appFile, 'utf8')).NEXT_PUBLIC_APP_URL;
console.log(`Serveur prêt. Lance npm run dev:ios, puis utilise ${origin} dans Profil.`);
if (new URL(origin).hostname !== 'localhost')
  console.log(
    `Domaine de rappel à renseigner dans Strava : ${new URL(origin).hostname} (sans port).`,
  );
