import { z } from 'zod';
import { fieldSchema, type TrailRace } from './types';

// An archived edition verified on the public UTMB results page.
export const historicalRaces: Record<string, { uri: string; year: number; date: string }> = {
  'utlac-120': {
    uri: '60134.utlactrailutlac120k-lakecomoultratrail.2026',
    year: 2026,
    date: '2026-05-08',
  },
};
export const historicalResponseSchema = z.object({
  field: fieldSchema.min(1),
  label: z.string().max(250),
  source: z.url(),
  year: z.number().int(),
  date: z.iso.date(),
  distanceKm: z.number().positive(),
  ascentM: z.number().nonnegative(),
  fetchedAt: z.iso.datetime(),
});
export function comparableHistory(
  race: Pick<TrailRace, 'distanceKm' | 'ascentM' | 'fieldDistanceKm' | 'fieldAscentM'>,
) {
  return (
    (race.fieldDistanceKm === null ||
      Math.abs(race.distanceKm / race.fieldDistanceKm - 1) <= 0.05) &&
    (race.fieldAscentM === null ||
      Math.abs(race.ascentM - race.fieldAscentM) <= Math.max(100, race.fieldAscentM * 0.1))
  );
}
