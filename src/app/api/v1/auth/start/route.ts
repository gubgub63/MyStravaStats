import { api, json, readBody } from '@/lib/auth/http';
import { challengeSchema, startMobile } from '@/lib/server/mobile-oauth';
import { z } from 'zod';
import { AppError } from '@/lib/utils/errors';
export async function POST(request: Request) {
  return api(async () => {
    const body = z.object({ challenge: challengeSchema }).safeParse(await readBody(request, 1024));
    if (!body.success) throw new AppError('INVALID_REQUEST', 400);
    return json(await startMobile(body.data.challenge));
  });
}
