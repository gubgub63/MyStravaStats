import { profileSchema, type TrailProfile } from './types';
import { uniqueExactRunner } from './identity';

export const TRAIL_STORAGE_EVENT = 'mystats:trail-updated';
export const seasonStorageKey = (athleteId?: number) => `mystats.trail.v1.${athleteId ?? 'local'}`;
type RunnerIdentity = { id: number; firstname?: string; lastname?: string };

/** Only share a compact, validated profile with the dashboard, never the season's results. */
export function readRunnerProfile(
  storage: Pick<Storage, 'getItem'>,
  athlete?: RunnerIdentity,
): TrailProfile | null {
  function read(key: string) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = profileSchema.safeParse(JSON.parse(raw)?.profile);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  const own = athlete ? read(seasonStorageKey(athlete.id)) : null;
  if (own?.utmb !== null && own?.utmb !== undefined) return own;
  const local = read(seasonStorageKey());
  if (!athlete) return local;
  if (
    local &&
    uniqueExactRunner(
      [{ fullname: `${local.firstname} ${local.lastname}`, profile: local }],
      athlete.firstname ?? '',
      athlete.lastname ?? '',
    )
  )
    return local;
  return own;
}
