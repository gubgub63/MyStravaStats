import { NextResponse } from 'next/server';
import { readSession, deleteSession } from '@/lib/auth/session';
import { api, checkOrigin, privateHeaders } from '@/lib/auth/http';
import { purgeDashboard } from '@/lib/dashboard/service';
import { appUrl } from '@/lib/env';
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    const s = await readSession();
    if (s) purgeDashboard(s);
    await deleteSession();
    return NextResponse.redirect(new URL('/', appUrl()), { status: 303, headers: privateHeaders });
  });
}
