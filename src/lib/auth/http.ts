import 'server-only';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { deleteSession } from './session';
import { AppError, asAppError, messages } from '@/lib/utils/errors';
export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
};
export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...privateHeaders, ...extra } });
}
export async function api(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    const e = asAppError(error);
    if (e.status === 401) await deleteSession();
    return json(
      {
        code: e.code,
        message: messages[e.code] ?? messages.STRAVA_API_ERROR,
        retryAfter: e.retryAfter,
      },
      e.status,
      e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : {},
    );
  }
}
export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(env().NEXT_PUBLIC_APP_URL).origin)
    throw new AppError('CSRF_REJECTED', 403);
}
