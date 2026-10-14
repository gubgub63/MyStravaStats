import type { HistoricalField, TrackAnalysis, TrailRace, TrailResult, TrailProfile } from './types';
import { comparableHistory } from './history';

export const effortKm = (distanceKm: number, ascentM: number) => distanceKm + ascentM / 100;
export function parseDuration(value: string): number | null {
  if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(value.trim())) return null;
  const [h, m, s = 0] = value.trim().split(':').map(Number);
  return m < 60 && s < 60 && h * 3600 + m * 60 + s > 0 ? h * 3600 + m * 60 + s : null;
}
export function duration(seconds: number | null) {
  if (seconds === null) return '—';
  const n = Math.round(seconds / 60);
  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`;
}
export function durationInput(seconds: number | null) {
  if (seconds === null) return '';
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;
}
export function difficulty(race: Pick<TrailRace, 'distanceKm' | 'ascentM' | 'terrain' | 'track'>) {
  return Math.min(
    100,
    Math.round(
      40 * Math.log1p(effortKm(race.distanceKm, race.ascentM) / 30) +
        0.35 * (race.track?.slopeIndex ?? 0) +
        5 * (race.terrain ?? 0),
    ),
  );
}
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[Math.floor(a.length / 2)] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
export function predictTime(
  race: TrailRace,
  results: TrailResult[],
  today = new Date().toISOString().slice(0, 10),
) {
  const referenceDate = new Date(today + 'T00:00:00Z');
  referenceDate.setUTCFullYear(referenceDate.getUTCFullYear() - 3);
  const refs = results
    .filter(
      (r) =>
        r.status === 'finished' &&
        r.seconds &&
        r.date <= today &&
        r.date >= referenceDate.toISOString().slice(0, 10),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (!refs.length) return null;
  const target = effortKm(race.distanceKm, race.ascentM);
  const estimates = refs.map(
    (r) =>
      r.seconds! *
      Math.pow(target / effortKm(r.distanceKm, r.ascentM), 1.06) *
      (race.terrain !== null && r.terrain !== null
        ? (1 + 0.06 * race.terrain) / (1 + 0.06 * r.terrain)
        : 1),
  );
  const central = median(estimates);
  const extrapolated = refs.some(
    (r) =>
      target / effortKm(r.distanceKm, r.ascentM) > 2 ||
      target / effortKm(r.distanceKm, r.ascentM) < 0.5,
  );
  const spread = Math.max(
    extrapolated ? 0.35 : 0.2,
    ...estimates.map((t) => Math.abs(t / central - 1)),
  );
  return {
    central,
    low: Math.max(central * 0.3, central * (1 - spread)),
    high: central * (1 + spread),
    references: refs.length,
    extrapolated,
  };
}
export function estimateField(seconds: number, field: HistoricalField) {
  if (!field.length) return null;
  const rank = (t: number) =>
    Math.min(field.length + 1, 1 + field.filter((r) => r.seconds < t).length);
  const estimate = (key: 'utmb' | 'itra') => {
    const rows = field.filter(
      (r) =>
        r[key] !== null && r[key]! > 0 && Math.abs(Math.log(r.seconds / seconds)) < Math.log(1.5),
    );
    if (rows.length < 3) return null;
    // A local inverse-time calibration, not either provider's proprietary model.
    return Math.min(1000, Math.round(median(rows.map((r) => r.seconds * r[key]!)) / seconds));
  };
  return {
    rank: rank(seconds),
    lowRank: rank(seconds * 0.9),
    highRank: rank(seconds * 1.1),
    finishers: field.length,
    utmb: estimate('utmb'),
    itra: estimate('itra'),
  };
}

export type LevelEstimate = {
  value: number;
  low: number | null;
  high: number | null;
  method: 'historical' | 'personal';
  references: number;
};
/** A personal equivalent level, not an official race score or a future general index. */
export function estimateLevels(
  race: TrailRace,
  results: TrailResult[],
  profile: TrailProfile,
  today?: string,
): Record<'utmb' | 'itra', LevelEstimate | null> {
  const empty = { utmb: null, itra: null };
  if (!race.targetSeconds || !Number.isFinite(race.targetSeconds) || race.targetSeconds <= 0)
    return empty;
  const prediction = predictTime(race, results, today);
  const field = comparableHistory(race) ? estimateField(race.targetSeconds, race.field) : null;
  const clamp = (value: number) => Math.max(0, Math.min(1000, Math.round(value)));
  const estimate = (key: 'utmb' | 'itra'): LevelEstimate | null => {
    const calibrated = field?.[key];
    if (calibrated !== null && calibrated !== undefined)
      return {
        value: calibrated,
        low: null,
        high: null,
        method: 'historical',
        references: race.field.filter(
          (row) =>
            row[key] !== null &&
            row[key]! > 0 &&
            Math.abs(Math.log(row.seconds / race.targetSeconds!)) < Math.log(1.5),
        ).length,
      };
    const baseline = profile[key];
    if (
      !prediction ||
      baseline === null ||
      !Number.isFinite(baseline) ||
      baseline <= 0 ||
      baseline > 1000
    )
      return null;
    return {
      value: clamp((baseline * prediction.central) / race.targetSeconds!),
      low: clamp((baseline * prediction.low) / race.targetSeconds!),
      high: clamp((baseline * prediction.high) / race.targetSeconds!),
      method: 'personal',
      references: prediction.references,
    };
  };
  return { utmb: estimate('utmb'), itra: estimate('itra') };
}

export type TrackPoint = { lat: number; lon: number; elevation: number; segment: number };
export function haversine(a: TrackPoint, b: TrackPoint) {
  const rad = Math.PI / 180;
  const v =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, v)));
}
export function analyzePoints(
  points: TrackPoint[],
): Omit<TrackAnalysis, 'filename' | 'source' | 'fetchedAt'> {
  if (points.length < 2 || points.length > 200000)
    throw new Error('La trace doit contenir entre 2 et 200 000 points.');
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lon) ||
        !Number.isFinite(p.elevation) ||
        Math.abs(p.lat) > 90 ||
        Math.abs(p.lon) > 180 ||
        p.elevation < -500 ||
        p.elevation > 10000,
    )
  )
    throw new Error('Coordonnées ou altitudes invalides.');
  let total = 0,
    ascent = 0,
    descent = 0,
    steep = 0,
    steepDown = 0,
    windowDistance = 0;
  let anchor = points[0];
  const profile = [{ ...points[0], km: 0 }];
  const step = Math.max(1, Math.ceil(points.length / 600));
  const closeWindow = (p: TrackPoint) => {
    if (windowDistance <= 0) return;
    const dz = p.elevation - anchor.elevation;
    const grade = dz / windowDistance;
    if (Math.abs(dz) >= 3) {
      ascent += Math.max(0, dz);
      descent += Math.max(0, -dz);
    }
    if (Math.abs(grade) > 0.15) steep += windowDistance;
    if (grade < -0.2) steepDown += windowDistance;
    windowDistance = 0;
    anchor = p;
  };
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      prev = points[i - 1];
    if (p.segment !== prev.segment) {
      closeWindow(prev);
      anchor = p;
    } else {
      const d = haversine(prev, p);
      if (d > 5000)
        throw new Error('La trace contient un saut GPS de plus de 5 km. Vérifie le fichier.');
      total += d;
      windowDistance += d;
      if (windowDistance >= 30) closeWindow(p);
    }
    if (i % step === 0 || i === points.length - 1 || p.segment !== prev.segment)
      profile.push({ ...p, km: total / 1000 });
  }
  closeWindow(points.at(-1)!);
  if (total < 100 || total > 1000000)
    throw new Error('La trace doit mesurer entre 100 m et 1 000 km.');
  return {
    distanceKm: total / 1000,
    ascentM: Math.round(ascent),
    descentM: Math.round(descent),
    steepFraction: steep / total,
    steepDescentFraction: steepDown / total,
    slopeIndex: Math.round(100 * ((0.65 * steep) / total + (0.35 * steepDown) / total)),
    profile,
    points: points.length,
  };
}
