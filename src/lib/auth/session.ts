import 'server-only';
import { sealData, unsealData } from 'iron-session';
import { cookies, headers } from 'next/headers';
import { databaseEnabled } from '@/lib/server/db';
import { createLogin, readLogin, revokeLogin, saveAccount } from '@/lib/server/accounts';
import { z } from 'zod';
import { env } from '@/lib/env';
import { AppError } from '@/lib/utils/errors';
export const SESSION_TTL = 24 * 3600;
const namespace = process.env.MYSTATS_COOKIE_NAMESPACE === 'ios-local' ? '_ios_local' : '';
export const COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? `__Host-strava_session${namespace}`
    : `strava_session${namespace}`;
export const STATE_COOKIE =
  process.env.NODE_ENV === 'production'
    ? `__Host-strava_state${namespace}`
    : `strava_state${namespace}`;
export const athleteSchema = z.object({
  id: z.number().int().positive(),
  firstname: z.string().max(100).optional(),
  lastname: z.string().max(100).optional(),
  profile: z.string().max(1000).optional(),
});
export const sessionSchema = z.object({
  accessToken: z.string().min(1).max(1000),
  refreshToken: z.string().min(1).max(1000),
  expiresAt: z.number().int().positive(),
  athlete: athleteSchema,
  scopes: z.array(z.string()).max(10),
  issuedAt: z.number().int().positive(),
  sessionId: z.string().uuid(),
  persistent: z.boolean().optional(),
});
export type StravaSession = z.infer<typeof sessionSchema>;
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
export function validateSession(
  data: unknown,
  now = Math.floor(Date.now() / 1000),
): StravaSession | null {
  const result = sessionSchema.safeParse(data);
  if (
    !result.success ||
    result.data.issuedAt > now + 60 ||
    now - result.data.issuedAt >= SESSION_TTL ||
    !result.data.scopes.some((s) => s === 'activity:read' || s === 'activity:read_all')
  )
    return null;
  return result.data;
}
export async function encodeSession(session: StravaSession) {
  return sealData(session, {
    password: env().SESSION_SECRET,
    ttl: Math.max(1, SESSION_TTL - (Math.floor(Date.now() / 1000) - session.issuedAt)),
  });
}
export async function readSession() {
  const authorization = (await headers()).get('authorization');
  if (authorization !== null) {
    if (!databaseEnabled() || !authorization.startsWith('Bearer ')) return null;
    return readLogin(authorization.slice(7), 'mobile');
  }
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  if (databaseEnabled()) return readLogin(raw, 'web');
  try {
    return validateSession(
      await unsealData(raw, { password: env().SESSION_SECRET, ttl: SESSION_TTL }),
    );
  } catch {
    return null;
  }
}
export async function requireSession() {
  const s = await readSession();
  if (!s) throw new AppError('NOT_AUTHENTICATED', 401);
  return s;
}
export async function writeSession(session: StravaSession) {
  if (databaseEnabled()) {
    await saveAccount(session);
    const { token } = await createLogin(session.athlete.id, 'web');
    (await cookies()).set(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_TTL });
  } else (await cookies()).set(COOKIE_NAME, await encodeSession(session), cookieOptions);
}
export async function deleteSession() {
  const bearer = (await headers()).get('authorization');
  const store = await cookies();
  const raw = bearer?.startsWith('Bearer ') ? bearer.slice(7) : store.get(COOKIE_NAME)?.value;
  if (databaseEnabled() && raw) await revokeLogin(raw);
  store.set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
}
