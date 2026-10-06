import { beforeEach, describe, expect, it, vi } from 'vitest';
let AppError: typeof import('@/lib/utils/errors').AppError;
import type { StravaSession } from '@/lib/auth/session';
const mocks = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getValidSession: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
vi.mock('@/lib/strava/client', () => ({ ...mocks, currentRateLimit: () => null }));
const session: StravaSession = {
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
  expiresAt: 2000000000,
  issuedAt: Math.floor(Date.now() / 1000),
  athlete: { id: 1 },
  scopes: ['read', 'activity:read'],
  sessionId: 'ef4c5890-b2f0-4a97-a944-4c087ea9bc23',
};
const activity = {
  id: 1,
  name: 'Test run',
  sport_type: 'Run',
  start_date: new Date().toISOString(),
  distance: 10000,
  total_elevation_gain: 100,
  moving_time: 3600,
};
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  AppError = (await import('@/lib/utils/errors')).AppError;
  mocks.getValidSession.mockImplementation(async (s) => s);
  mocks.getActivities.mockResolvedValue({ activities: [activity], partial: false });
});
describe('dashboard service', () => {
  it('reuses private data while isolating athlete sessions and periods', async () => {
    const { loadDashboard } = await import('@/lib/dashboard/service');
    await loadDashboard(session, 90);
    await loadDashboard(session, 90);
    expect(mocks.getActivities).toHaveBeenCalledTimes(1);
    await loadDashboard(
      { ...session, sessionId: 'd8b6237d-39b5-40c3-bf83-c24bb57213fa', athlete: { id: 2 } },
      90,
    );
    await loadDashboard(session, 180);
    expect(mocks.getActivities).toHaveBeenCalledTimes(3);
  });
  it('purges cached statistics when refresh rejects the session', async () => {
    const { loadDashboard } = await import('@/lib/dashboard/service');
    await loadDashboard(session, 90);
    mocks.getValidSession.mockRejectedValueOnce(new AppError('STRAVA_TOKEN_REFRESH_FAILED', 401));
    await expect(loadDashboard(session, 90)).rejects.toThrow('STRAVA_TOKEN_REFRESH_FAILED');
    mocks.getActivities.mockResolvedValue({ activities: [], partial: false });
    expect((await loadDashboard(session, 90)).summary.activityCount).toBe(0);
    expect(mocks.getActivities).toHaveBeenCalledTimes(2);
  });
  it('refreshes once after an unexpected 401 and uses the updated credentials', async () => {
    const { loadDashboard } = await import('@/lib/dashboard/service');
    mocks.getActivities.mockRejectedValueOnce(new AppError('NOT_AUTHENTICATED', 401));
    const renewed = {
      ...session,
      accessToken: 'test-new-access',
      refreshToken: 'test-new-refresh',
    };
    mocks.refreshAccessToken.mockResolvedValue(renewed);
    const data = await loadDashboard(session, 90);
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.getActivities.mock.calls[1][0]).toBe(renewed);
    expect(data.summary.distanceKm).toBe(10);
    expect(JSON.stringify(data)).not.toContain('test-new-access');
  });
  it('does not retry a second 401 or refresh a token already renewed at request start', async () => {
    const { loadDashboard } = await import('@/lib/dashboard/service');
    mocks.getValidSession.mockResolvedValue({ ...session, accessToken: 'test-renewed' });
    mocks.getActivities.mockRejectedValue(new AppError('NOT_AUTHENTICATED', 401));
    await expect(loadDashboard(session, 90)).rejects.toThrow('NOT_AUTHENTICATED');
    expect(mocks.getActivities).toHaveBeenCalledTimes(1);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });
  it('filters inclusive local dates and separates caches for custom ranges', async () => {
    const { loadDashboard } = await import('@/lib/dashboard/service');
    mocks.getActivities.mockResolvedValue({
      activities: [
        {
          ...activity,
          id: 1,
          start_date: '2024-01-01T23:30:00Z',
          start_date_local: '2024-01-02T01:30:00Z',
        },
        {
          ...activity,
          id: 2,
          start_date: '2024-01-02T23:30:00Z',
          start_date_local: '2024-01-03T01:30:00Z',
        },
        {
          ...activity,
          id: 3,
          start_date: '2024-01-01T00:30:00Z',
          start_date_local: '2023-12-31T22:30:00Z',
        },
      ],
      partial: false,
    });
    const range = { from: '2024-01-01', to: '2024-01-02' };
    const data = await loadDashboard(session, range);
    expect(data.recentActivities.map((a) => a.id)).toEqual([1]);
    expect(data.weekly).toHaveLength(1);
    expect(data.range).toEqual(range);
    await loadDashboard(session, range);
    expect(mocks.getActivities).toHaveBeenCalledTimes(1);
    const other = await loadDashboard(session, { from: '2024-01-03', to: '2024-01-03' });
    expect(other.recentActivities.map((a) => a.id)).toEqual([2]);
    expect(mocks.getActivities).toHaveBeenCalledTimes(2);
  });
});
