import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env';
import { AppError } from '@/lib/utils/errors';
import { tokenExchange } from '@/lib/strava/client';
import { transaction } from './db';
import { createLogin, hash, opaqueToken, saveAccount } from './accounts';
export const challengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const verifierSchema = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);
export async function startMobile(challenge: string) {
  const config = env(),
    state = opaqueToken();
  // Global bounded number of pending logins; expired rows never accumulate.
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(184392)');
    await client.query('DELETE FROM mystats_oauth WHERE expires_at<=now()');
    const { rows } = await client.query('SELECT count(*)::integer AS count FROM mystats_oauth');
    if (rows[0].count >= 500) throw new AppError('STRAVA_RATE_LIMIT', 429, 60);
    await client.query(
      "INSERT INTO mystats_oauth(state_hash,challenge,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [hash(state), challenge],
    );
  });
  const params = new URLSearchParams({
    client_id: config.STRAVA_CLIENT_ID,
    redirect_uri: new URL('/api/v1/auth/callback', config.NEXT_PUBLIC_APP_URL).href,
    response_type: 'code',
    scope: 'read,activity:read',
    approval_prompt: 'auto',
    state,
  });
  return { authorizationUrl: 'https://www.strava.com/oauth/authorize?' + params, state };
}
export async function completeMobile(params: URLSearchParams) {
  const state = params.get('state') ?? '';
  if (!challengeSchema.safeParse(state).success) throw new AppError('OAUTH_INVALID_STATE', 400);
  return transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM mystats_oauth WHERE state_hash=$1 AND expires_at>now() AND code_hash IS NULL FOR UPDATE',
      [hash(state)],
    );
    if (!rows.length) throw new AppError('OAUTH_INVALID_STATE', 400);
    if (params.has('error')) throw new AppError('OAUTH_ACCESS_DENIED', 400);
    const scopes = (params.get('scope') ?? '').split(/[ ,]+/).filter(Boolean);
    const code = params.get('code');
    if (!code || code.length > 1000) throw new AppError('OAUTH_CODE_MISSING', 400);
    if (
      !scopes.includes('read') ||
      !scopes.some((s) => s === 'activity:read' || s === 'activity:read_all')
    )
      throw new AppError('STRAVA_SCOPE_MISSING', 403);
    const token = await tokenExchange({ code, grant_type: 'authorization_code' });
    if (!token.athlete) throw new AppError('OAUTH_TOKEN_EXCHANGE_FAILED', 502);
    const granted = token.scope ? token.scope.split(/[ ,]+/).filter(Boolean) : scopes;
    if (
      !granted.includes('read') ||
      !granted.some((s) => s === 'activity:read' || s === 'activity:read_all')
    )
      throw new AppError('STRAVA_SCOPE_MISSING', 403);
    await saveAccount(
      {
        athlete: token.athlete,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        scopes: granted,
        issuedAt: Math.floor(Date.now() / 1000),
        sessionId: randomUUID(),
      },
      client,
    );
    const handoff = opaqueToken();
    await client.query(
      "UPDATE mystats_oauth SET code_hash=$2,athlete_id=$3,expires_at=now()+interval '60 seconds' WHERE state_hash=$1",
      [hash(state), hash(handoff), token.athlete.id],
    );
    return { code: handoff, state };
  });
}
export async function exchangeMobile(code: string, verifier: string) {
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const athleteId = await transaction(async (client) => {
    const { rows } = await client.query(
      'DELETE FROM mystats_oauth WHERE code_hash=$1 AND challenge=$2 AND expires_at>now() RETURNING athlete_id',
      [hash(code), challenge],
    );
    if (!rows[0]?.athlete_id) throw new AppError('OAUTH_INVALID_STATE', 400);
    return Number(rows[0].athlete_id);
  });
  return createLogin(athleteId, 'mobile');
}
