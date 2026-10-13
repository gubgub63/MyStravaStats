import { TrailSeason } from '@/components/trail-season';
import { readSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
export const metadata = { title: 'Ta saison trail', robots: { index: false, follow: false } };
export default async function SeasonPage() {
  const session = await readSession();
  let stravaConfigured = false;
  try {
    env();
    stravaConfigured = true;
  } catch {
    /* Local planning works without OAuth. */
  }
  return <TrailSeason athlete={session?.athlete ?? null} stravaConfigured={stravaConfigured} />;
}
