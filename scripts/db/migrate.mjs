import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(184391)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS mystats_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of (await readdir(new URL('../../db/migrations/', import.meta.url)))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if ((await client.query('SELECT 1 FROM mystats_migrations WHERE name=$1', [name])).rowCount)
      continue;
    await client.query(
      await readFile(new URL('../../db/migrations/' + name, import.meta.url), 'utf8'),
    );
    await client.query('INSERT INTO mystats_migrations(name) VALUES($1)', [name]);
    console.log('Applied', name);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
