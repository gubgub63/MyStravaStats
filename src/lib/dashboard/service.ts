import 'server-only';
import type { StravaSession } from '@/lib/auth/session';
import {
  getActivities,
  getValidSession,
  refreshAccessToken,
  currentRateLimit,
} from '@/lib/strava/client';
import { normalizeActivity } from '@/lib/strava/normalize';
import { AppError } from '@/lib/utils/errors';
import { aggregate } from './aggregate';
import { PrivateCache, CACHE_TTL_MS } from './cache';
import type { DashboardData } from './types';
const cache = new PrivateCache<Omit<DashboardData, 'athlete'>>();
export function purgeDashboard(session: StravaSession) {
  cache.deletePrefix(session.sessionId + ':');
}
export async function loadDashboard(session: StravaSession, days: number): Promise<DashboardData> {
  try {
    return await readDashboard(session, days);
  } catch (error) {
    if (error instanceof AppError && error.status === 401) purgeDashboard(session);
    throw error;
  }
}
async function readDashboard(session: StravaSession, days: number): Promise<DashboardData> {
  // Validate/rotate the cookie even when activities are served from memory.
  let valid = await getValidSession(session);
  const key = `${session.sessionId}:${session.athlete.id}:${[...session.scopes].sort().join(',')}:${days}`;
  const data = await cache.get(key, async () => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    let raw;
    try {
      raw = await getActivities(valid, { after: start, before: end });
    } catch (e) {
      if (!(e instanceof AppError) || e.status !== 401 || valid !== session) throw e;
      valid = await refreshAccessToken(valid);
      raw = await getActivities(valid, { after: start, before: end });
    }
    const fetchedAt = new Date().toISOString();
    return {
      ...aggregate(
        raw.activities.map(normalizeActivity),
        new Date(start * 1000).toISOString(),
        new Date(end * 1000).toISOString(),
      ),
      days,
      partial: raw.partial,
      fetchedAt,
      cacheExpiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      rateLimit: currentRateLimit(),
    };
  });
  return { ...data, athlete: session.athlete };
}
