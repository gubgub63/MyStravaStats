import 'server-only';
import { z } from 'zod';
import { seasonSchema, type Season } from '@/lib/trail/types';
import { database } from './db';
export const workspaceWriteSchema = z.object({
  revision: z.number().int().min(0).max(2147483646),
  season: seasonSchema,
});
export type Workspace = { revision: number; season: Season | null; updatedAt: string | null };
export async function readWorkspace(athleteId: number): Promise<Workspace> {
  const { rows } = await database().query(
    'SELECT revision,season,updated_at FROM mystats_workspaces WHERE athlete_id=$1',
    [athleteId],
  );
  return rows.length
    ? {
        revision: rows[0].revision,
        season: seasonSchema.parse(rows[0].season),
        updatedAt: rows[0].updated_at.toISOString(),
      }
    : { revision: 0, season: null, updatedAt: null };
}
export async function writeWorkspace(athleteId: number, revision: number, season: Season) {
  const payload = JSON.stringify(season);
  const { rows } =
    revision === 0
      ? await database().query(
          `INSERT INTO mystats_workspaces(athlete_id,revision,season) VALUES($1,1,$2::jsonb)
        ON CONFLICT(athlete_id) DO NOTHING RETURNING revision,season,updated_at`,
          [athleteId, payload],
        )
      : await database().query(
          `UPDATE mystats_workspaces SET season=$3::jsonb,revision=revision+1,updated_at=now()
        WHERE athlete_id=$1 AND revision=$2 RETURNING revision,season,updated_at`,
          [athleteId, revision, payload],
        );
  if (!rows.length) return null;
  return {
    revision: rows[0].revision,
    season: rows[0].season as Season,
    updatedAt: rows[0].updated_at.toISOString(),
  };
}
