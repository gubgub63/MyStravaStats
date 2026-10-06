import { describe, it, expect, vi } from 'vitest';
import {
  metersToKm,
  metersPerSecondToPace,
  metersPerSecondToKmH,
  secondsToDuration,
  pace,
} from '@/lib/utils/units';
import { normalizeActivity, rawActivitySchema } from '@/lib/strava/normalize';
import { aggregate, isoWeek } from '@/lib/dashboard/aggregate';
import { validateSession, SESSION_TTL } from '@/lib/auth/session';
import { validateCallback } from '@/lib/auth/oauth';
import { PrivateCache } from '@/lib/dashboard/cache';
import { shouldRefresh } from '@/lib/strava/client';
const raw = {
  id: 1,
  name: 'Trail',
  sport_type: 'TrailRun',
  start_date: '2026-01-04T23:30:00Z',
  start_date_local: '2026-01-05T00:30:00Z',
  distance: 10000,
  total_elevation_gain: 600,
  moving_time: 3600,
};
const session = {
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
  expiresAt: 20000,
  athlete: { id: 1 },
  scopes: ['read', 'activity:read'],
  issuedAt: 1000,
  sessionId: 'ef4c5890-b2f0-4a97-a944-4c087ea9bc23',
};
describe('units and aggregation', () => {
  it('converts distance, speed, pace and rounded duration', () => {
    expect(metersToKm(1500)).toBe(1.5);
    expect(metersPerSecondToKmH(5)).toBe(18);
    expect(metersPerSecondToPace(5)).toBe(200);
    expect(metersPerSecondToPace(0)).toBeNull();
    expect(secondsToDuration(3599)).toBe('1 h 00');
    expect(pace(359.9)).toBe('6:00');
  });
  it('normalizes zero distance without infinity', () => {
    const a = normalizeActivity({ ...raw, distance: 0 });
    expect(a.paceSecondsPerKm).toBeNull();
    expect(a.averageSpeedMps).toBe(0);
  });
  it('keeps local activity day and uses Monday weeks across year boundary', () => {
    expect(isoWeek('2026-01-01')).toBe('2025-12-29');
    const a = normalizeActivity(raw);
    const stats = aggregate([a], '2025-12-29', '2026-01-11');
    expect(stats.weekly[0].activityCount).toBe(0);
    expect(stats.weekly[1].distanceKm).toBe(10);
    expect(stats.summary.elevationGainM).toBe(600);
    expect(stats.running.effortPace).toBe(225);
  });
  it('uses weighted running pace and excludes cycling', () => {
    const a = normalizeActivity(raw);
    const stats = aggregate(
      [
        a,
        { ...a, id: 2, distanceKm: 20, movingTimeSeconds: 3600 },
        { ...a, id: 3, sportType: 'Ride' },
      ],
      '2026-01-01',
      '2026-01-10',
    );
    expect(stats.running.paceSecondsPerKm).toBe(240);
    expect(stats.running.count).toBe(2);
    expect(stats.summary.activityCount).toBe(3);
  });
  it('rejects malformed Strava activities', () => {
    expect(rawActivitySchema.safeParse({ ...raw, distance: -1 }).success).toBe(false);
  });
});
describe('session and OAuth', () => {
  it('rejects absent, expired, future and unscoped sessions', () => {
    expect(validateSession(null, 2000)).toBeNull();
    expect(validateSession(session, 2000)).toEqual(session);
    expect(validateSession(session, 1000 + SESSION_TTL)).toBeNull();
    expect(validateSession(session, 800)).toBeNull();
    expect(validateSession({ ...session, scopes: ['read'] }, 2000)).toBeNull();
  });
  it('refreshes before expiration with a margin', () => {
    expect(shouldRefresh(1100, 1000)).toBe(true);
    expect(shouldRefresh(1300, 1000)).toBe(false);
  });
  it.each([
    ['', undefined, 'OAUTH_INVALID_STATE'],
    ['code=x', 'state', 'OAUTH_INVALID_STATE'],
    ['state=bad&code=x', 'state', 'OAUTH_INVALID_STATE'],
    ['state=state', 'state', 'OAUTH_CODE_MISSING'],
    ['state=state&error=access_denied', 'state', 'OAUTH_ACCESS_DENIED'],
    ['state=state&code=x&scope=read', 'state', 'STRAVA_SCOPE_MISSING'],
  ])('rejects callback %s', (query, expected, code) => {
    expect(() => validateCallback(new URLSearchParams(query), expected)).toThrow(code);
  });
  it('accepts granted activity scopes', () => {
    expect(
      validateCallback(new URLSearchParams('state=state&code=x&scope=read,activity:read'), 'state'),
    ).toEqual({ code: 'x', scopes: ['read', 'activity:read'] });
  });
});
describe('private memory cache', () => {
  it('coalesces requests, isolates keys and expires', async () => {
    vi.useFakeTimers();
    const cache = new PrivateCache<number>(100);
    const loader = vi.fn(async () => 42);
    expect(await Promise.all([cache.get('one', loader), cache.get('one', loader)])).toEqual([
      42, 42,
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.get('two', loader);
    expect(loader).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(101);
    await cache.get('one', loader);
    expect(loader).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
  it('does not cache failed requests and purges a session', async () => {
    const cache = new PrivateCache<number>();
    await expect(
      cache.get('one:90', async () => {
        throw Error('fail');
      }),
    ).rejects.toThrow('fail');
    await cache.get('one:90', async () => 42);
    cache.deletePrefix('one:');
    expect(await cache.get('one:90', async () => 43)).toBe(43);
  });
  it('does not restore an entry purged during loading', async () => {
    const cache = new PrivateCache<number>();
    let resolve!: (n: number) => void;
    const pending = cache.get(
      'one:90',
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    cache.deletePrefix('one:');
    resolve(42);
    await pending;
    expect(await cache.get('one:90', async () => 43)).toBe(43);
  });
});
