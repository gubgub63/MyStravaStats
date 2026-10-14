import { z } from 'zod';

const positive = z.number().finite().positive();
const score = z.number().finite().min(0).max(1000).nullable();
const date = z.iso.date();
const source = z
  .string()
  .max(1000)
  .refine((v) => !v || /^https:\/\//.test(v), 'Utilise un lien HTTPS.');
export const profileSchema = z.object({
  firstname: z.string().max(100),
  lastname: z.string().max(100),
  utmb: score,
  itra: score,
  utmbUrl: source,
  itraUrl: source,
  checkedAt: z.string().max(40),
});
export const resultSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(250),
  date,
  distanceKm: positive.max(1000),
  ascentM: z.number().finite().min(0).max(100000),
  seconds: positive.max(30 * 86400).nullable(),
  status: z.enum(['finished', 'dnf']),
  rank: z.number().int().positive().nullable(),
  finishers: z.number().int().positive().nullable(),
  utmb: score,
  itra: score,
  source,
  terrain: z.number().int().min(0).max(4).nullable(),
});
export const trackSchema = z.object({
  distanceKm: positive.max(1000),
  ascentM: z.number().finite().min(0),
  descentM: z.number().finite().min(0),
  steepFraction: z.number().min(0).max(1),
  steepDescentFraction: z.number().min(0).max(1),
  slopeIndex: z.number().min(0).max(100),
  points: z.number().int().min(2),
  profile: z
    .array(
      z.object({
        km: z.number().finite(),
        elevation: z.number().finite(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        segment: z.number().int(),
      }),
    )
    .min(2)
    .max(700),
  filename: z.string().max(250),
  fetchedAt: z.string().max(40),
  source,
});
export const fieldSchema = z
  .array(
    z.object({
      seconds: positive.max(30 * 86400),
      utmb: score,
      itra: score,
    }),
  )
  .max(20000);
export const raceSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(250),
  date,
  distanceKm: positive.max(1000),
  ascentM: z.number().finite().min(0).max(100000),
  priority: z.enum(['A', 'B', 'C']),
  targetSeconds: positive.max(30 * 86400).nullable(),
  terrain: z.number().int().min(0).max(4).nullable(),
  notes: z.string().max(5000),
  source,
  catalogId: z.string().max(100).nullable(),
  track: trackSchema.nullable(),
  field: fieldSchema,
  fieldLabel: z.string().max(250),
  fieldSource: source.default(''),
  fieldEdition: z.number().int().min(1900).max(2200).nullable().default(null),
  fieldDistanceKm: positive.max(1000).nullable().default(null),
  fieldAscentM: z.number().finite().min(0).max(100000).nullable().default(null),
  cutoffHours: positive.nullable(),
  organizerTerrain: z.string().max(250).default(''),
  sourceCheckedAt: z.string().max(40).default(''),
});
export const seasonSchema = z.object({
  version: z.literal(1),
  profile: profileSchema,
  results: z.array(resultSchema).max(1000),
  races: z.array(raceSchema).max(100),
});
export type TrailProfile = z.infer<typeof profileSchema>;
export type TrailResult = z.infer<typeof resultSchema>;
export type TrailRace = z.infer<typeof raceSchema>;
export type TrackAnalysis = z.infer<typeof trackSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type HistoricalField = z.infer<typeof fieldSchema>;
export function emptySeason(firstname = '', lastname = ''): Season {
  return {
    version: 1,
    profile: {
      firstname,
      lastname,
      utmb: null,
      itra: null,
      utmbUrl: '',
      itraUrl: '',
      checkedAt: '',
    },
    results: [],
    races: [],
  };
}
