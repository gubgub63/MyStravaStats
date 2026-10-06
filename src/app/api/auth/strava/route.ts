import { randomUUID } from 'node:crypto';
import { sealData } from 'iron-session';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { STATE_COOKIE, cookieOptions } from '@/lib/auth/session';
import { privateHeaders } from '@/lib/auth/http';
export async function GET() {
  try {
    const config = env();
    const state = randomUUID();
    const q = new URLSearchParams({
      client_id: config.STRAVA_CLIENT_ID,
      redirect_uri: config.STRAVA_REDIRECT_URI,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read',
      state,
    });
    const response = NextResponse.redirect(`https://www.strava.com/oauth/authorize?${q}`, {
      headers: privateHeaders,
    });
    response.cookies.set(
      STATE_COOKIE,
      await sealData({ state }, { password: config.SESSION_SECRET, ttl: 600 }),
      { ...cookieOptions, maxAge: 600 },
    );
    return response;
  } catch {
    return NextResponse.redirect(
      new URL(
        '/?error=CONFIGURATION_ERROR',
        process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      ),
      { headers: privateHeaders },
    );
  }
}
