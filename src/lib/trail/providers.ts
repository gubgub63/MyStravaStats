import 'server-only';
import { z } from 'zod';
import { catalog, type RaceCatalogItem } from './catalog';
import { parseDuration } from './model';
import { resultSchema, type TrailResult } from './types';

// Only public, fixed provider origins. Never follow a user-supplied URL.
export async function publicText(url: string, maxBytes = 8 * 1024 * 1024) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `La source ne répond pas (${response.status}). Réessaie ou utilise la saisie manuelle.`,
    );
  if (Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('Fichier trop volumineux.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('La source a renvoyé une réponse vide.');
  const decoder = new TextDecoder();
  let content = '',
    bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Fichier trop volumineux.');
      content += decoder.decode(value, { stream: true });
    }
    return content + decoder.decode();
  } finally {
    await reader.cancel();
  }
}
export async function fetchCatalogRace(id: string): Promise<RaceCatalogItem> {
  const race = catalog.find((r) => r.id === id);
  if (!race) throw new Error('Course inconnue.');
  const source = `https://www.utlactrail.com/gare/${race.format}k/`;
  const html = await publicText(source);
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const distance = text.match(/Distanza\s+([\d.,]+)\s*km/i)?.[1];
  const ascent = text.match(/Dislivello\s+([\d.,]+)\s*m\s*D\+/i)?.[1];
  const date = text.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
  if (!distance || !ascent || !date)
    throw new Error('Le format de la page organisateur a changé. Utilise la saisie manuelle.');
  const cutoff = text.match(/Tempo max\s+(\d+)\s*(?:ore|h)(?:\s+(\d+)\s*minuti)?/i);
  const gpx = html.match(/(?:href|src)=["']([^"']*\/map\/gpx\/[^"']+\.gpx)["']/i)?.[1];
  const gpxUrl = gpx ? new URL(gpx, source).href : '';
  const distanceKm = Number(distance.replace(/\./g, '').replace(',', '.'));
  const ascentM = Number(ascent.replace(/[.,]/g, ''));
  if (!(distanceKm > 0 && distanceKm <= 1000 && ascentM >= 0 && ascentM < 100000))
    throw new Error('Les données de la source sont incohérentes.');
  return {
    ...race,
    source,
    distanceKm,
    ascentM,
    date: `${date[3]}-${date[2]}-${date[1]}`,
    cutoffHours: cutoff ? Number(cutoff[1]) + Number(cutoff[2] ?? 0) / 60 : null,
    gpxUrl: gpxUrl.startsWith('https://www.utlactrail.com/map/gpx/') ? gpxUrl : '',
    terrainDescription: text.match(/Terreno\s+(.+?)\s+Ristori/i)?.[1]?.slice(0, 200) ?? '',
    checkedAt: new Date().toISOString(),
  };
}
const runnerSchema = z.object({
  id: z.number().int().positive(),
  fullname: z.string(),
  uri: z.string().regex(/^\d+\.[a-z0-9.\-]+$/i),
  ip: z.number().nullable(),
  nationality: z.string(),
  ageGroup: z.string(),
});
export type RunnerMatch = z.infer<typeof runnerSchema>;
export async function searchRunners(firstname: string, lastname: string): Promise<RunnerMatch[]> {
  const q = new URLSearchParams({
    search: `${firstname} ${lastname}`.trim(),
    limit: '10',
    offset: '0',
    category: 'general',
  });
  const payload = JSON.parse(
    await publicText(`https://api.utmb.world/search/runners?${q}`, 500000),
  );
  return z.object({ runners: z.array(runnerSchema) }).parse(payload).runners;
}
const rawResult = z.object({
  raceYearId: z.number(),
  race: z.string(),
  dateIso: z.string(),
  distance: z.coerce.number(),
  elevationGain: z.number(),
  time: z.string().nullable(),
  isDnf: z.boolean(),
  rank: z.number().nullable(),
  totalRanked: z.number().nullable(),
  index: z.number().nullable(),
});
const runnerPage = z.object({
  fullname: z.string(),
  performanceIndexes: z.array(z.object({ piCategory: z.string(), index: z.number().nullable() })),
  results: z.object({ results: z.array(rawResult) }),
});
export async function fetchRunner(uri: string) {
  if (!/^\d+\.[a-z0-9.\-]+$/i.test(uri) || uri.length > 200)
    throw new Error('Profil UTMB invalide.');
  const source = `https://utmb.world/runner/${uri}`;
  const html = await publicText(source);
  const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!data)
    throw new Error(
      'Le profil public est indisponible. Ouvre la fiche officielle ou saisis tes résultats.',
    );
  const runner = runnerPage.parse(JSON.parse(data).props.pageProps);
  const results: TrailResult[] = [];
  for (const r of runner.results.results) {
    const parsed = resultSchema.safeParse({
      id: `utmb-${uri.split('.')[0]}-${r.raceYearId}`,
      name: r.race,
      date: r.dateIso,
      distanceKm: r.distance,
      ascentM: r.elevationGain,
      seconds: r.time ? parseDuration(r.time) : null,
      status: r.isDnf ? 'dnf' : 'finished',
      rank: r.rank,
      finishers: r.totalRanked,
      utmb: r.index,
      itra: null,
      source,
      terrain: null,
    });
    if (parsed.success) results.push(parsed.data);
  }
  return {
    fullname: runner.fullname,
    source,
    utmb: runner.performanceIndexes.find((p) => p.piCategory === 'general')?.index ?? null,
    indexes: runner.performanceIndexes,
    results,
    checkedAt: new Date().toISOString(),
  };
}
