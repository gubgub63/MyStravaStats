import { requireSession } from '@/lib/auth/session';
import { api, json } from '@/lib/auth/http';
import { loadDashboard } from '@/lib/dashboard/service';
export async function GET() {
  return api(async () => json((await loadDashboard(await requireSession(), 90)).recentActivities));
}
