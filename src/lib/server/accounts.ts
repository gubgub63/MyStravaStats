import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { sealData, unsealData } from 'iron-session';
import type { StravaSession } from '@/lib/auth/session';
import { sessionSchema } from '@/lib/auth/session';
import { AppError } from '@/lib/utils/errors';
import { database, transaction } from './db';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
function encryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new AppError('CONFIGURATION_ERROR', 503);
  return key;
}
export const sealCredentials = (value: StravaSession) =>
  sealData(value, { password: encryptionKey(), ttl: 0 });
export async function openCredentials(value: string): Promise<StravaSession> {
  return sessionSchema.parse(await unsealData(value, { password: encryptionKey(), ttl: 0 }));
}
export async function saveAccount(session: StravaSession, connection?: Pick<PoolClient, 'query'>) {
  await (connection ?? database()).query(
    `INSERT INTO mystats_athletes(id,profile,credentials) VALUES($1,$2,$3)
    ON CONFLICT(id) DO UPDATE SET profile=$2, credentials=$3, updated_at=now()`,
    [session.athlete.id, session.athlete, await sealCredentials(session)],
  );
}
export async function createLogin(athleteId: number, kind: 'web' | 'mobile') {
  const token = opaqueToken(),
    id = randomUUID();
  await database().query('DELETE FROM mystats_sessions WHERE expires_at<=now()');
  const ttl = kind === 'mobile' ? 30 * 86400 : 86400;
  await database().query(
    "INSERT INTO mystats_sessions(token_hash,id,athlete_id,kind,expires_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 second')",
    [hash(token), id, athleteId, kind, ttl],
  );
  return { token, expiresIn: ttl };
}
export async function readLogin(token: string, kind: 'web' | 'mobile') {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { rows } = await database().query(
    `SELECT s.id,a.credentials FROM mystats_sessions s JOIN mystats_athletes a ON a.id=s.athlete_id
    WHERE token_hash=$1 AND kind=$2 AND expires_at>now()`,
    [hash(token), kind],
  );
  if (!rows.length) return null;
  return {
    ...(await openCredentials(rows[0].credentials)),
    sessionId: rows[0].id,
    persistent: true as const,
  };
}
export async function revokeLogin(token: string) {
  await database().query('DELETE FROM mystats_sessions WHERE token_hash=$1', [hash(token)]);
}
export async function revokeAthlete(athleteId: number) {
  await database().query('DELETE FROM mystats_sessions WHERE athlete_id=$1', [athleteId]);
}
// Row lock serializes Strava refreshes across devices and server processes.
export async function refreshAccount(
  session: StravaSession,
  exchange: (
    token: string,
  ) => Promise<{ access_token: string; refresh_token: string; expires_at: number }>,
) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT credentials FROM mystats_athletes WHERE id=$1 FOR UPDATE',
      [session.athlete.id],
    );
    if (!rows.length) throw new AppError('NOT_AUTHENTICATED', 401);
    const latest = await openCredentials(rows[0].credentials);
    if (latest.accessToken !== session.accessToken)
      return { ...latest, sessionId: session.sessionId, persistent: true };
    const tokens = await exchange(latest.refreshToken);
    const next = {
      ...latest,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
    };
    await client.query('UPDATE mystats_athletes SET credentials=$2,updated_at=now() WHERE id=$1', [
      session.athlete.id,
      await sealCredentials(next),
    ]);
    return { ...next, sessionId: session.sessionId, persistent: true };
  });
}
