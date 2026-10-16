import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { seasonSchema } from '../src/lib/trail/types.ts';
const schema = JSON.stringify(z.toJSONSchema(seasonSchema), null, 2) + '\n';
const target = new URL('../packages/contracts/season-v1.schema.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== schema)
    throw new Error('Run npm run contracts to update season-v1.schema.json');
} else await writeFile(target, schema);
await mkdir(new URL('../apps/ios/MyStatsCore/Tests/MyStatsCoreTests/Fixtures/', import.meta.url), {
  recursive: true,
});
const fixture = await readFile(
  new URL('../packages/contracts/trail-v1.json', import.meta.url),
  'utf8',
);
const swift = new URL(
  '../apps/ios/MyStatsCore/Tests/MyStatsCoreTests/Fixtures/trail-v1.json',
  import.meta.url,
);
if (process.argv.includes('--check')) {
  if ((await readFile(swift, 'utf8')) !== fixture)
    throw new Error('Swift fixtures are out of date');
} else await writeFile(swift, fixture);
