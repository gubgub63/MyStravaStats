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
import { resolvePeriod, type DashboardPeriod } from './period';
const cache = new PrivateCache<Omit<DashboardData, 'athlete'>>();
export function purgeDashboard(session: StravaSession) {
    cache.deletePrefix(session.sessionId + ':');
}
export async function loadDashboard(
    session: StravaSession,
    period: DashboardPeriod,
): Promise<DashboardData> {
    try {
        return await readDashboard(session, period);
    } catch (error) {
        if (error instanceof AppError && error.status === 401) purgeDashboard(session);
        throw error;
    }
}
async function readDashboard(
    session: StravaSession,
    period: DashboardPeriod,
): Promise<DashboardData> {
    const range = resolvePeriod(period);
    // Validate/rotate the cookie even when activities are served from memory.
    let valid = await getValidSession(session);
    const key = `${session.sessionId}:${session.athlete.id}:${[...session.scopes].sort().join(',')}:${typeof period === 'number' ? period : period.from + ':' + period.to}`;
    const data = await cache.get(key, async () => {
        const { after, before } = range;
        let raw;
        try {
            raw = await getActivities(valid, { after, before });
        } catch (e) {
            if (!(e instanceof AppError) || e.status !== 401 || valid !== session) throw e;
            valid = await refreshAccessToken(valid);
            raw = await getActivities(valid, { after, before });
        }
        const fetchedAt = new Date().toISOString();
        return {
            ...aggregate(
                raw.activities
                    .map(normalizeActivity)
                    .filter(
                        (a) =>
                            !range.custom ||
                            (a.localDate.slice(0, 10) >= range.from && a.localDate.slice(0, 10) <= range.to),
                    ),
                range.from,
                range.to,
            ),
            days: range.days,
            range: { from: range.from, to: range.to },
            partial: raw.partial,
            fetchedAt,
            cacheExpiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
            rateLimit: currentRateLimit(),
        };
    });
    return { ...data, athlete: session.athlete };
}
