import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({
  token: '',
  cookie: '',
  authorization: null as string | null,
  origin: 'http://localhost:3000',
}));
let engine: PGlite | pg.Pool;
let connection: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(state.authorization ? { Authorization: state.authorization } : {}),
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
    set: (_key: string, value: string) => {
      state.cookie = value;
    },
  }),
}));
vi.mock('@/lib/server/db', () => ({
  databaseEnabled: () => true,
  database: () => connection,
  transaction: async <T>(work: (client: unknown) => Promise<T>) => {
    const client = engine instanceof pg.Pool ? await engine.connect() : connection;
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      if ('release' in client) client.release();
    }
  },
}));
vi.mock('@/lib/env', () => ({
  env: () => ({
    STRAVA_CLIENT_ID: '123',
    STRAVA_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-only-session-password-of-32-characters',
    NEXT_PUBLIC_APP_URL: state.origin,
    STRAVA_REDIRECT_URI: state.origin + '/api/auth/strava/callback',
  }),
}));
const session = {
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  athlete: { id: 1, firstname: 'Test' },
  scopes: ['read', 'activity:read'],
  issuedAt: Math.floor(Date.now() / 1000),
  sessionId: 'ef4c5890-b2f0-4a97-a944-4c087ea9bc23',
};
const fixture = JSON.parse(readFileSync('packages/contracts/trail-v1.json', 'utf8')).season;
beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-only-encryption-password-of-32-characters';
  engine = process.env.TEST_DATABASE_URL
    ? new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
    : new PGlite();
  connection = {
    query: async (sql, params) =>
      engine instanceof PGlite ? engine.query(sql, params) : engine.query(sql, params),
  };
  const sql = readFileSync('db/migrations/001_sync.sql', 'utf8');
  if (engine instanceof PGlite) await engine.exec(sql);
  else await engine.query(sql);
});
afterAll(async () => {
  if (engine instanceof PGlite) await engine.close();
  else await engine.end();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await connection.query('DELETE FROM mystats_oauth');
  await connection.query('DELETE FROM mystats_athletes');
  state.authorization = null;
  state.cookie = '';
  const { saveAccount, createLogin } = await import('@/lib/server/accounts');
  await saveAccount(session);
  state.token = (await createLogin(1, 'mobile')).token;
});
async function put(revision: number, season = fixture) {
  const { PUT } = await import('@/app/api/v1/season/route');
  state.authorization = 'Bearer ' + state.token;
  return PUT(
    new Request(state.origin + '/api/v1/season', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token },
      body: JSON.stringify({ revision, season }),
    }),
  );
}
describe('persistent accounts and workspace synchronization', () => {
  it('stores encrypted provider credentials and hashed app sessions', async () => {
    const rows = (await connection.query('SELECT credentials FROM mystats_athletes')).rows;
    expect(rows[0].credentials).not.toContain('access-secret');
    expect(rows[0].credentials).not.toContain('refresh-secret');
    expect(
      (await connection.query('SELECT token_hash FROM mystats_sessions')).rows[0].token_hash,
    ).not.toBe(state.token);
    state.authorization = 'Bearer ' + state.token;
    const { GET } = await import('@/app/api/v1/session/route');
    const response = await GET();
    expect(await response.json()).toEqual({ authenticated: true, athlete: session.athlete });
  });
  it('atomically saves, rejects stale writes and preserves the latest revision', async () => {
    expect((await put(0)).status).toBe(200);
    const stale = await put(0);
    expect(stale.status).toBe(409);
    expect((await stale.json()).workspace.revision).toBe(1);
    const a = await put(1, { ...fixture, profile: { ...fixture.profile, firstname: 'Changed' } });
    expect(a.status).toBe(200);
    expect((await put(1)).status).toBe(409);
    const { readWorkspace } = await import('@/lib/server/workspace');
    expect((await readWorkspace(1)).season?.profile.firstname).toBe('Changed');
    expect((await readWorkspace(2)).season).toBeNull();
  });
  it('allows exactly one of two concurrent writes against the same revision', async () => {
    await put(0);
    const { writeWorkspace } = await import('@/lib/server/workspace');
    const replies = await Promise.all([
      writeWorkspace(1, 1, fixture),
      writeWorkspace(1, 1, fixture),
    ]);
    expect(replies.filter(Boolean)).toHaveLength(1);
  });
  it('isolates two athletes and refuses forged or expired sessions', async () => {
    await put(0);
    const { saveAccount, createLogin } = await import('@/lib/server/accounts');
    await saveAccount({ ...session, athlete: { id: 2 } });
    const second = await createLogin(2, 'mobile');
    const { GET } = await import('@/app/api/v1/season/route');
    state.authorization = 'Bearer ' + second.token;
    expect((await (await GET()).json()).season).toBeNull();
    state.authorization = 'Bearer ' + state.token + 'x';
    expect((await GET()).status).toBe(401);
    await connection.query("UPDATE mystats_sessions SET expires_at=now()-interval '1 second'");
    state.authorization = 'Bearer ' + second.token;
    expect((await GET()).status).toBe(401);
  });
  it('revokes logins and never accepts a web session as a mobile bearer', async () => {
    const { createLogin, readLogin, revokeLogin } = await import('@/lib/server/accounts');
    const web = await createLogin(1, 'web');
    expect(await readLogin(web.token, 'mobile')).toBeNull();
    await revokeLogin(state.token);
    expect(await readLogin(state.token, 'mobile')).toBeNull();
  });
  it('rejects cross-origin cookie mutations and invalid imports', async () => {
    const { createLogin } = await import('@/lib/server/accounts');
    state.cookie = (await createLogin(1, 'web')).token;
    const { PUT } = await import('@/app/api/v1/season/route');
    const response = await PUT(
      new Request(state.origin + '/api/v1/season', {
        method: 'PUT',
        headers: { Origin: 'https://evil.example' },
        body: JSON.stringify({ revision: 0, season: fixture }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await put(0, { ...fixture, version: 99 })).status).toBe(400);
    expect((await put(0, { ...fixture, races: [fixture.races[0], fixture.races[0]] })).status).toBe(
      400,
    );
  });
  it('completes PKCE handoff once, bound to its verifier and state', async () => {
    const verifier = 'a'.repeat(43),
      challenge = createHash('sha256').update(verifier).digest('base64url');
    const { startMobile, completeMobile, exchangeMobile } =
      await import('@/lib/server/mobile-oauth');
    const start = await startMobile(challenge);
    expect(new URL(start.authorizationUrl).searchParams.get('redirect_uri')).toBe(
      state.origin + '/api/v1/auth/callback',
    );
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
    const done = await completeMobile(
      new URLSearchParams({
        state: start.state,
        code: 'provider-code',
        scope: 'read,activity:read',
      }),
    );
    await expect(exchangeMobile(done.code, 'b'.repeat(43))).rejects.toThrow('OAUTH_INVALID_STATE');
    const login = await exchangeMobile(done.code, verifier);
    expect(login.token).toHaveLength(43);
    await expect(exchangeMobile(done.code, verifier)).rejects.toThrow('OAUTH_INVALID_STATE');
    await expect(
      completeMobile(
        new URLSearchParams({
          state: 'z'.repeat(43),
          code: 'provider-code',
          scope: 'read,activity:read',
        }),
      ),
    ).rejects.toThrow('OAUTH_INVALID_STATE');
  });
  it('serializes credential refreshes and retains app session identity', async () => {
    const { refreshAccount } = await import('@/lib/server/accounts');
    const exchange = vi.fn(async () => ({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: session.expiresAt + 1000,
    }));
    const a = await refreshAccount(session, exchange),
      b = await refreshAccount(session, exchange);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(a.sessionId).toBe(session.sessionId);
    expect(b.refreshToken).toBe('new-refresh');
  });
});
