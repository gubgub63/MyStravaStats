import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));
vi.mock('@/lib/env', () => ({
  env: () => ({
    STRAVA_CLIENT_ID: '123',
    STRAVA_CLIENT_SECRET: 'test-only-secret',
    SESSION_SECRET: 'test-only-password-of-at-least-32-characters',
    STRAVA_REDIRECT_URI: 'http://localhost:3000/api/auth/strava/callback',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  }),
  appUrl: () => 'http://localhost:3000',
}));
const session = {
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  athlete: { id: 1, firstname: 'Test' },
  scopes: ['read', 'activity:read'],
  issuedAt: Math.floor(Date.now() / 1000),
  sessionId: 'ef4c5890-b2f0-4a97-a944-4c087ea9bc23',
};
beforeEach(() => {
  jar.clear();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('Strava transport', () => {
  it.each([
    [401, 'NOT_AUTHENTICATED'],
    [403, 'STRAVA_FORBIDDEN'],
    [429, 'STRAVA_RATE_LIMIT'],
    [500, 'STRAVA_API_ERROR'],
  ])('maps HTTP %s', async (status, code) => {
    const fetch = vi.fn(async () => new Response('{}', { status }));
    vi.stubGlobal('fetch', fetch);
    const { stravaFetch } = await import('@/lib/strava/client');
    await expect(stravaFetch('/athlete', session)).rejects.toThrow(String(code));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('stops subsequent requests after rate exhaustion', async () => {
    const fetch = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const { stravaFetch } = await import('@/lib/strava/client');
    await expect(stravaFetch('/athlete', session)).rejects.toThrow('STRAVA_RATE_LIMIT');
    await expect(stravaFetch('/athlete', session)).rejects.toThrow('STRAVA_RATE_LIMIT');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('paginates and reports truncation', async () => {
    const activity = {
      id: 1,
      name: 'Run',
      sport_type: 'Run',
      start_date: '2026-01-01T08:00:00Z',
      distance: 1000,
      moving_time: 300,
      total_elevation_gain: 0,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(Array.from({ length: 100 }, (_, i) => ({ ...activity, id: i + 1 }))),
      )
      .mockResolvedValueOnce(Response.json([activity]));
    vi.stubGlobal('fetch', fetch);
    const { getActivities } = await import('@/lib/strava/client');
    const result = await getActivities(session, { after: 1, before: 100, maxPages: 2 });
    expect(result.activities).toHaveLength(101);
    expect(result.partial).toBe(false);
    expect(fetch.mock.calls[1][0]).toContain('page=2');
    fetch.mockResolvedValue(Response.json(Array.from({ length: 100 }, () => activity)));
    expect((await getActivities(session, { after: 1, before: 100, maxPages: 1 })).partial).toBe(
      true,
    );
  });
  it('handles exchange and refresh failures without upstream data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('sensitive-upstream-body', { status: 400 })),
    );
    const { tokenExchange } = await import('@/lib/strava/client');
    await expect(tokenExchange({ code: 'test-code' })).rejects.toThrow(
      'OAUTH_TOKEN_EXCHANGE_FAILED',
    );
    await expect(tokenExchange({ refresh_token: 'test-refresh' }, true)).rejects.toThrow(
      'STRAVA_TOKEN_REFRESH_FAILED',
    );
  });
  it('rotates tokens once for concurrent refreshes and seals updated cookies', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        access_token: 'test-new-access',
        refresh_token: 'test-new-refresh',
        expires_at: session.expiresAt + 1000,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const { refreshAccessToken } = await import('@/lib/strava/client');
    const [a, b] = await Promise.all([refreshAccessToken(session), refreshAccessToken(session)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.refreshToken).toBe('test-new-refresh');
    expect(b.accessToken).toBe('test-new-access');
    expect(jar.get('strava_session')).not.toContain('test-new-refresh');
    const { readSession } = await import('@/lib/auth/session');
    expect((await readSession())?.refreshToken).toBe('test-new-refresh');
  });
  it('uses the recommended revoke endpoint with credentials in body/header', async () => {
    const fetch = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const { deauthorize } = await import('@/lib/strava/client');
    await deauthorize(session);
    expect(fetch.mock.calls[0][0]).toBe('https://www.strava.com/oauth/revoke');
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain('token_type_hint=refresh_token');
  });
});
describe('routes', () => {
  it('returns no private information without session', async () => {
    const { GET } = await import('@/app/api/dashboard/route');
    const response = await GET(new Request('http://localhost:3000/api/dashboard'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });
  it('rejects cross-origin logout and allows local logout', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const bad = await POST(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
    );
    expect(bad.status).toBe(403);
    const good = await POST(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000' },
      }),
    );
    expect(good.status).toBe(303);
    expect(jar.get('strava_session')).toBe('');
  });
  it('never returns tokens from session endpoint', async () => {
    const { writeSession } = await import('@/lib/auth/session');
    await writeSession(session);
    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({ authenticated: true, athlete: session.athlete });
    expect(JSON.stringify(body)).not.toContain('test-access');
  });
  it('removes local session even when revocation fails', async () => {
    const { writeSession } = await import('@/lib/auth/session');
    await writeSession(session);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    const { POST } = await import('@/app/api/auth/disconnect/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/disconnect', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000' },
      }),
    );
    expect(response.headers.get('location')).toContain('revocation=failed');
    expect(jar.get('strava_session')).toBe('');
  });
  it('rejects missing callback state and clears state cookie', async () => {
    const { GET } = await import('@/app/api/auth/strava/callback/route');
    const response = await GET(
      new Request('http://localhost:3000/api/auth/strava/callback?code=test-code'),
    );
    expect(response.headers.get('location')).toContain('OAUTH_INVALID_STATE');
    expect(jar.get('strava_state')).toBe('');
  });
  it('completes OAuth from sealed state and redirects with encrypted session', async () => {
    const { GET: start } = await import('@/app/api/auth/strava/route');
    const first = await start(new Request('http://localhost:3000/api/auth/strava'));
    jar.set('strava_state', first.cookies.get('strava_state')!.value);
    const auth = new URL(first.headers.get('location')!);
    expect(auth.searchParams.get('scope')).toBe('read,activity:read');
    const state = auth.searchParams.get('state')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
          expires_at: session.expiresAt,
          athlete: session.athlete,
        }),
      ),
    );
    const { GET: callback } = await import('@/app/api/auth/strava/callback/route');
    const response = await callback(
      new Request(
        `http://localhost:3000/api/auth/strava/callback?code=test-code&state=${state}&scope=read,activity:read`,
      ),
    );
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard');
    const { readSession } = await import('@/lib/auth/session');
    expect((await readSession())?.athlete.id).toBe(1);
    expect(jar.get('strava_session')).not.toContain('test-access');
    expect(jar.get('strava_state')).toBe('');
  });
});
