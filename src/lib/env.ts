import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/utils/errors';
const schema = z.object({
  STRAVA_CLIENT_ID: z.string().regex(/^\d+$/),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  STRAVA_REDIRECT_URI: z.url(),
  NEXT_PUBLIC_APP_URL: z.url(),
});
export function env() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new AppError('CONFIGURATION_ERROR', 503);
  const data = parsed.data;
  const app = new URL(data.NEXT_PUBLIC_APP_URL);
  const redirect = new URL(data.STRAVA_REDIRECT_URI);
  if (
    redirect.origin !== app.origin ||
    redirect.pathname !== '/api/auth/strava/callback' ||
    redirect.search ||
    redirect.hash ||
    (process.env.NODE_ENV === 'production' && app.protocol !== 'https:')
  )
    throw new AppError('CONFIGURATION_ERROR', 503);
  return data;
}
export function appUrl() {
  return env().NEXT_PUBLIC_APP_URL;
}
