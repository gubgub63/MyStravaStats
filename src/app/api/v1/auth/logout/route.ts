import { requireSession, deleteSession } from '@/lib/auth/session';
import { checkMutation, api, json } from '@/lib/auth/http';
import { purgeDashboard } from '@/lib/dashboard/service';
export async function POST(request: Request) {
  return api(async () => {
    await checkMutation(request);
    const session = await requireSession();
    purgeDashboard(session);
    await deleteSession();
    return json({ ok: true });
  });
}
