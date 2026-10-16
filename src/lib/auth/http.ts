import 'server-only';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { requireSession, deleteSession } from './session';
import { AppError, asAppError, messages } from '@/lib/utils/errors';
export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
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

export async function checkMutation(request: Request) {
  if (request.headers.has('authorization')) {
    await requireSession();
    return;
  }
  checkOrigin(request);
}
export async function readBody(request: Request, maxBytes = 15 * 1024 * 1024): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw new AppError('INVALID_REQUEST', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_REQUEST', 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw new AppError('INVALID_REQUEST', 413);
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('INVALID_REQUEST', 400);
  } finally {
    await reader.cancel();
  }
}
