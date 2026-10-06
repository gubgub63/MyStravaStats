import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/utils/errors';
export function validateCallback(params: URLSearchParams, expectedState?: string) {
  const state = params.get('state');
  if (
    !state ||
    !expectedState ||
    state.length > 200 ||
    Buffer.byteLength(state) !== Buffer.byteLength(expectedState) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
  )
    throw new AppError('OAUTH_INVALID_STATE', 400);
  if (params.has('error')) throw new AppError('OAUTH_ACCESS_DENIED', 400);
  const code = params.get('code');
  if (!code || code.length > 1000) throw new AppError('OAUTH_CODE_MISSING', 400);
  const scopes = (params.get('scope') ?? '').split(/[ ,]+/).filter(Boolean);
  if (
    !scopes.includes('read') ||
    !scopes.some((s) => s === 'activity:read' || s === 'activity:read_all')
  )
    throw new AppError('STRAVA_SCOPE_MISSING', 403);
  return { code, scopes };
}
