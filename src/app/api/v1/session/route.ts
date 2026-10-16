import { requireSession } from '@/lib/auth/session';
import { api, json } from '@/lib/auth/http';
export async function GET() {
  return api(async () => json({ authenticated: true, athlete: (await requireSession()).athlete }));
}
