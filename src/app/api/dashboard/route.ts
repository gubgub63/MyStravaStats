import { requireSession } from '@/lib/auth/session';
import { api, json } from '@/lib/auth/http';
import { loadDashboard } from '@/lib/dashboard/service';
import { resolvePeriod, type DashboardPeriod } from '@/lib/dashboard/period';
import { AppError } from '@/lib/utils/errors';
export const maxDuration = 60;
export async function GET(request: Request) {
  return api(async () => {
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    const period: DashboardPeriod =
      params.has('from') || params.has('to')
        ? { from: params.get('from') ?? '', to: params.get('to') ?? '' }
        : Number(params.get('days') ?? 90);
    try {
      resolvePeriod(period);
    } catch {
      throw new AppError('INVALID_REQUEST', 400);
    }
    return json(await loadDashboard(session, period));
  });
}
