import { requireSession } from '@/lib/auth/session';
import { api, json } from '@/lib/auth/http';
import { loadDashboard } from '@/lib/dashboard/service';
import { AppError } from '@/lib/utils/errors';
export const maxDuration = 60;
export async function GET(request: Request) {
  return api(async () => {
    const session = await requireSession();
    const days = Number(new URL(request.url).searchParams.get('days') ?? 90);
    if (![90, 180, 365].includes(days)) throw new AppError('INVALID_REQUEST', 400);
    return json(await loadDashboard(session, days));
  });
}
