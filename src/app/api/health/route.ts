import { databaseEnabled, database } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    if (databaseEnabled()) {
      if ((process.env.TOKEN_ENCRYPTION_KEY?.length ?? 0) < 32) throw new Error('configuration');
      await database().query('SELECT 1 FROM mystats_workspaces LIMIT 0');
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
