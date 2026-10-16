import { requireSession, deleteSession } from '@/lib/auth/session';
import { checkMutation, api, json } from '@/lib/auth/http';
import { deauthorize } from '@/lib/strava/client';
import { revokeAthlete } from '@/lib/server/accounts';
import { purgeDashboard } from '@/lib/dashboard/service';
export async function POST(request: Request) {
  return api(async () => {
    await checkMutation(request);
    const session = await requireSession();
    let revoked = true;
    try {
      await deauthorize(session);
    } catch {
      revoked = false;
    } finally {
      await revokeAthlete(session.athlete.id);
      purgeDashboard(session);
      await deleteSession();
    }
    return json({ ok: true, revoked });
  });
}
