import { randomUUID } from 'node:crypto';
import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { validateCallback } from '@/lib/auth/oauth';
import { STATE_COOKIE, cookieOptions, writeSession, deleteSession } from '@/lib/auth/session';
import { tokenExchange } from '@/lib/strava/client';
import { privateHeaders } from '@/lib/auth/http';
import { asAppError, AppError } from '@/lib/utils/errors';
export async function GET(request: Request) {
  const store = await cookies();
  const sealed = store.get(STATE_COOKIE)?.value;
  store.set(STATE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  try {
    const config = env();
    const payload = sealed
      ? await unsealData<{ state?: string }>(sealed, { password: config.SESSION_SECRET, ttl: 600 })
      : {};
    const { code, scopes } = validateCallback(new URL(request.url).searchParams, payload.state);
    const token = await tokenExchange({ code, grant_type: 'authorization_code' });
    if (!token.athlete) throw new AppError('OAUTH_TOKEN_EXCHANGE_FAILED', 502);
    const granted = token.scope ? token.scope.split(/[ ,]+/).filter(Boolean) : scopes;
    if (
      !granted.includes('read') ||
      !granted.some((s) => s === 'activity:read' || s === 'activity:read_all')
    )
      throw new AppError('STRAVA_SCOPE_MISSING', 403);
    await writeSession({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_at,
      athlete: token.athlete,
      scopes: granted,
      issuedAt: Math.floor(Date.now() / 1000),
      sessionId: randomUUID(),
    });
    return NextResponse.redirect(new URL('/dashboard', base), { headers: privateHeaders });
  } catch (error) {
    await deleteSession();
    return NextResponse.redirect(new URL(`/?error=${asAppError(error).code}`, base), {
      headers: privateHeaders,
    });
  }
}
