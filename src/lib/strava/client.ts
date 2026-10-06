import 'server-only';
import { createHash } from 'node:crypto';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { env } from '@/lib/env';
import { athleteSchema, writeSession, type StravaSession } from '@/lib/auth/session';
import { AppError } from '@/lib/utils/errors';
import { rawActivitySchema } from './normalize';
const tokenSchema = z.object({
  access_token: z.string().min(1).max(1000),
  refresh_token: z.string().min(1).max(1000),
  expires_at: z.number().int().positive(),
  athlete: athleteSchema.optional(),
  scope: z.string().optional(),
});
let blockedUntil = 0;
let rateLimit: {
  limit: string | null;
  usage: string | null;
  readLimit: string | null;
  readUsage: string | null;
} | null = null;
export function currentRateLimit() {
  return rateLimit;
}
export function shouldRefresh(expiresAt: number, now = Date.now() / 1000) {
  return expiresAt <= now + 180;
}
export function observeLimits(response: Response) {
  rateLimit = {
    limit: response.headers.get('x-ratelimit-limit'),
    usage: response.headers.get('x-ratelimit-usage'),
    readLimit: response.headers.get('x-readratelimit-limit'),
    readUsage: response.headers.get('x-readratelimit-usage'),
  };
  const now = Date.now();
  const nextQuarter = (Math.floor(now / 900000) + 1) * 900000 + 1000;
  const nextDay = new Date(now);
  nextDay.setUTCHours(24, 0, 1, 0);
  for (const [limit, usage] of [
    [rateLimit.limit, rateLimit.usage],
    [rateLimit.readLimit, rateLimit.readUsage],
  ]) {
    const l = limit?.split(',').map(Number),
      u = usage?.split(',').map(Number);
    if (l && u) {
      if (u[0] >= l[0]) blockedUntil = Math.max(blockedUntil, nextQuarter);
      if (u[1] >= l[1]) blockedUntil = Math.max(blockedUntil, nextDay.getTime());
    }
  }
  if (response.status === 429) {
    const retry = response.headers.get('retry-after');
    const seconds =
      retry && /^\d+$/.test(retry)
        ? Number(retry)
        : retry
          ? Math.max(1, (Date.parse(retry) - now) / 1000)
          : (nextQuarter - now) / 1000;
    blockedUntil = Math.max(blockedUntil, now + (Number.isFinite(seconds) ? seconds : 900) * 1000);
  }
}
export async function requestStrava(url: string, init: RequestInit = {}) {
  if (Date.now() < blockedUntil)
    throw new AppError('STRAVA_RATE_LIMIT', 429, Math.ceil((blockedUntil - Date.now()) / 1000));
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new AppError('STRAVA_API_ERROR', 502);
  }
  observeLimits(response);
  if (response.status === 429)
    throw new AppError(
      'STRAVA_RATE_LIMIT',
      429,
      Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
    );
  if (response.status === 401) throw new AppError('NOT_AUTHENTICATED', 401);
  if (response.status === 403) throw new AppError('STRAVA_FORBIDDEN', 403);
  if (!response.ok) throw new AppError('STRAVA_API_ERROR', 502);
  return response;
}
export async function tokenExchange(fields: Record<string, string>, refreshing = false) {
  const config = env();
  try {
    const response = await requestStrava('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.STRAVA_CLIENT_ID,
        client_secret: config.STRAVA_CLIENT_SECRET,
        ...fields,
      }),
    });
    return tokenSchema.parse(await response.json());
  } catch (e) {
    if (e instanceof AppError && e.status === 429) throw e;
    throw new AppError(
      refreshing ? 'STRAVA_TOKEN_REFRESH_FAILED' : 'OAUTH_TOKEN_EXCHANGE_FAILED',
      refreshing ? 401 : 502,
    );
  }
}
// Short-lived encrypted refresh results coalesce concurrent requests within one process.
// No plaintext OAuth credentials are retained in this map.
const refreshes = new Map<string, { promise: Promise<string>; until: number }>();
export async function refreshAccessToken(session: StravaSession) {
  const key = createHash('sha256')
    .update(session.sessionId + session.refreshToken)
    .digest('hex');
  const now = Date.now();
  for (const [k, entry] of refreshes) if (entry.until <= now) refreshes.delete(k);
  let entry = refreshes.get(key);
  if (!entry) {
    const promise = (async () => {
      const token = await tokenExchange(
        { grant_type: 'refresh_token', refresh_token: session.refreshToken },
        true,
      );
      return sealData(
        {
          ...session,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: token.expires_at,
        },
        { password: env().SESSION_SECRET, ttl: 30 },
      );
    })();
    if (refreshes.size >= 100) refreshes.delete(refreshes.keys().next().value!);
    entry = { promise, until: now + 30000 };
    refreshes.set(key, entry);
    promise.catch(() => refreshes.delete(key));
  }
  const updated = await unsealData<StravaSession>(await entry.promise, {
    password: env().SESSION_SECRET,
    ttl: 30,
  });
  await writeSession(updated);
  return updated;
}
export async function getValidSession(session: StravaSession) {
  return shouldRefresh(session.expiresAt) ? refreshAccessToken(session) : session;
}
export async function stravaFetch<T>(endpoint: string, session: StravaSession): Promise<T> {
  const response = await requestStrava(`https://www.strava.com/api/v3${endpoint}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  try {
    return (await response.json()) as T;
  } catch {
    throw new AppError('STRAVA_API_ERROR', 502);
  }
}
export async function getActivities(
  session: StravaSession,
  options: { after: number; before: number; maxPages?: number },
) {
  const activities: z.infer<typeof rawActivitySchema>[] = [];
  const maxPages = options.maxPages ?? 10;
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      after: String(options.after),
      before: String(options.before),
      per_page: '100',
      page: String(page),
    });
    const parsed = z
      .array(rawActivitySchema)
      .max(100)
      .safeParse(await stravaFetch(`/athlete/activities?${q}`, session));
    if (!parsed.success) throw new AppError('STRAVA_API_ERROR', 502);
    activities.push(...parsed.data);
    if (parsed.data.length < 100) return { activities, partial: false };
  }
  return { activities, partial: true };
}
export async function getAthlete(session: StravaSession) {
  const parsed = athleteSchema.safeParse(await stravaFetch('/athlete', session));
  if (!parsed.success) throw new AppError('STRAVA_API_ERROR', 502);
  return parsed.data;
}
export async function deauthorize(session: StravaSession) {
  const config = env();
  await requestStrava('https://www.strava.com/oauth/revoke', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(config.STRAVA_CLIENT_ID + ':' + config.STRAVA_CLIENT_SECRET).toString('base64')}`,
    },
    body: new URLSearchParams({ token: session.refreshToken, token_type_hint: 'refresh_token' }),
  });
}
