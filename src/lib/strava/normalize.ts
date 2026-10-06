import { z } from 'zod';
export const rawActivitySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().max(1000),
  sport_type: z.string().optional(),
  type: z.string().optional(),
  start_date: z.iso.datetime(),
  start_date_local: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    .optional(),
  distance: z.number().nonnegative(),
  total_elevation_gain: z.number().nonnegative(),
  moving_time: z.number().nonnegative(),
  average_speed: z.number().nonnegative().optional(),
});
export type RawActivity = z.infer<typeof rawActivitySchema>;
export function normalizeActivity(a: RawActivity) {
  const distanceKm = a.distance / 1000;
  return {
    id: a.id,
    name: a.name,
    sportType: a.sport_type ?? a.type ?? 'Other',
    startDate: a.start_date,
    localDate: a.start_date_local ?? a.start_date,
    distanceKm,
    elevationGainM: a.total_elevation_gain,
    movingTimeSeconds: a.moving_time,
    averageSpeedMps: a.moving_time > 0 ? a.distance / a.moving_time : 0,
    paceSecondsPerKm: distanceKm > 0 ? a.moving_time / distanceKm : null,
  };
}
export type DashboardActivity = ReturnType<typeof normalizeActivity>;
