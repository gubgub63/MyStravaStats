import { NextResponse } from 'next/server';
import { readSession, deleteSession } from '@/lib/auth/session';
import { api, checkOrigin, privateHeaders } from '@/lib/auth/http';
import { purgeDashboard } from '@/lib/dashboard/service';
import { deauthorize } from '@/lib/strava/client';
import { appUrl } from '@/lib/env';
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    const s = await readSession();
    let failed = false;
    try {
      if (s) await deauthorize(s);
    } catch {
      failed = true;
    } finally {
      if (s) purgeDashboard(s);
      await deleteSession();
    }
    return NextResponse.redirect(
      new URL(failed ? '/?revocation=failed' : '/?disconnected=1', appUrl()),
      { status: 303, headers: privateHeaders },
    );
  });
}
