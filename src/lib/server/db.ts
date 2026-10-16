import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { AppError } from '@/lib/utils/errors';
let pool: Pool | undefined;
export const databaseEnabled = () => Boolean(process.env.DATABASE_URL);
export function database() {
  if (!databaseEnabled()) throw new AppError('SYNC_NOT_CONFIGURED', 503);
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
  }));
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
