import { api, json, readBody } from '@/lib/auth/http';
import { exchangeMobile, challengeSchema, verifierSchema } from '@/lib/server/mobile-oauth';
import { z } from 'zod';
import { AppError } from '@/lib/utils/errors';
export async function POST(request: Request) {
  return api(async () => {
    const body = z
      .object({ code: challengeSchema, verifier: verifierSchema })
      .safeParse(await readBody(request, 2048));
    if (!body.success) throw new AppError('INVALID_REQUEST', 400);
    return json(await exchangeMobile(body.data.code, body.data.verifier));
  });
}
