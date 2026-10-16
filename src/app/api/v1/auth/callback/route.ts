import { completeMobile } from '@/lib/server/mobile-oauth';
import { asAppError } from '@/lib/utils/errors';
import { privateHeaders } from '@/lib/auth/http';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = new URL('mystats://auth/callback');
  try {
    const result = await completeMobile(params);
    target.searchParams.set('code', result.code);
    target.searchParams.set('state', result.state);
  } catch (error) {
    target.searchParams.set('error', asAppError(error).code);
    target.searchParams.set('state', params.get('state')?.slice(0, 100) ?? '');
  }
  return new Response(null, { status: 302, headers: { ...privateHeaders, Location: target.href } });
}
