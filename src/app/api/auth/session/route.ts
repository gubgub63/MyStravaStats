import { readSession } from '@/lib/auth/session';
import { api, json } from '@/lib/auth/http';
export async function GET() {
  return api(async () => {
    const session = await readSession();
    return json(
      session ? { authenticated: true, athlete: session.athlete } : { authenticated: false },
    );
  });
}
