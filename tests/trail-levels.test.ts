import { describe, expect, it } from 'vitest';
import { estimateLevels } from '@/lib/trail/model';
import { readRunnerProfile, seasonStorageKey } from '@/lib/trail/storage';
import { emptySeason, raceSchema, resultSchema } from '@/lib/trail/types';

const today = '2026-10-14';
const profile = { ...emptySeason('Alice', 'Trail').profile, utmb: 600 };
const race = raceSchema.parse({
  id: 'goal',
  name: 'Trail',
  date: '2027-05-01',
  distanceKm: 40,
  ascentM: 2000,
  priority: 'A',
  targetSeconds: 5 * 3600,
  terrain: null,
  notes: '',
  source: '',
  catalogId: null,
  track: null,
  field: [],
  fieldLabel: '',
  cutoffHours: null,
});
const result = resultSchema.parse({
  id: 'result',
  name: 'Reference',
  date: '2026-05-01',
  distanceKm: 40,
  ascentM: 2000,
  seconds: 6 * 3600,
  status: 'finished',
  rank: null,
  finishers: null,
  utmb: null,
  itra: null,
  source: '',
  terrain: null,
});

describe('personal equivalent level estimates', () => {
  it('uses a known personal index when historical race scores are not public', () => {
    const estimate = estimateLevels(race, [result], profile, today);
    expect(estimate.utmb).toMatchObject({
      value: 720,
      low: 576,
      high: 864,
      method: 'personal',
      references: 1,
    });
    expect(profile.utmb).toBe(600);
  });
  it('preserves the starting level at the predicted time and responds monotonically to the target', () => {
    const same = estimateLevels(
      { ...race, targetSeconds: 6 * 3600 },
      [result],
      profile,
      today,
    ).utmb!;
    const slower = estimateLevels(
      { ...race, targetSeconds: 7 * 3600 },
      [result],
      profile,
      today,
    ).utmb!;
    expect(same.value).toBe(600);
    expect(slower.value).toBeLessThan(same.value);
    expect(estimateLevels(race, [result], profile, today).utmb!.value).toBeGreaterThan(same.value);
  });
  it('never infers ITRA from UTMB and uses ITRA only when that index is known', () => {
    expect(estimateLevels(race, [result], profile, today).itra).toBeNull();
    expect(estimateLevels(race, [result], { ...profile, itra: 500 }, today).itra).toMatchObject({
      value: 600,
      method: 'personal',
    });
  });
  it('prefers actual historical calibration independently for each provider', () => {
    const field = [4.5, 5, 5.5].map((hours) => ({
      seconds: hours * 3600,
      utmb: (700 * 5) / hours,
      itra: null,
    }));
    const estimate = estimateLevels({ ...race, field }, [result], { ...profile, itra: 500 }, today);
    expect(estimate.utmb).toMatchObject({ value: 700, method: 'historical', references: 3 });
    expect(estimate.itra).toMatchObject({ value: 600, method: 'personal' });
  });
  it('does not invent a prediction without a personal reference or a valid index', () => {
    expect(estimateLevels(race, [], profile, today).utmb).toBeNull();
    expect(estimateLevels(race, [{ ...result, status: 'dnf' }], profile, today).utmb).toBeNull();
    expect(estimateLevels(race, [result], { ...profile, utmb: null }, today).utmb).toBeNull();
    expect(estimateLevels(race, [result], { ...profile, utmb: 0 }, today).utmb).toBeNull();
  });
  it('rejects missing targets and bounds extreme extrapolations', () => {
    for (const targetSeconds of [null, 0, NaN, Infinity])
      expect(estimateLevels({ ...race, targetSeconds }, [result], profile, today)).toEqual({
        utmb: null,
        itra: null,
      });
    expect(
      estimateLevels({ ...race, targetSeconds: 3600 }, [result], profile, today).utmb,
    ).toMatchObject({ value: 1000, low: 1000, high: 1000 });
  });
  it('discards historical scores when the reference route no longer matches', () => {
    const changed = {
      ...race,
      fieldDistanceKm: 80,
      fieldAscentM: 4000,
      field: Array.from({ length: 3 }, () => ({ seconds: 5 * 3600, utmb: 900, itra: null })),
    };
    expect(estimateLevels(changed, [], { ...profile, utmb: null }, today).utmb).toBeNull();
    expect(estimateLevels(changed, [result], profile, today).utmb?.method).toBe('personal');
  });
});

describe('sharing the known UTMB index with the dashboard', () => {
  const storage = (values: Record<string, string>) => ({
    getItem: (key: string) => values[key] ?? null,
  });
  const serialized = (index: number | null, firstname = 'Alice') =>
    JSON.stringify({
      ...emptySeason(firstname, 'Trail'),
      profile: { ...profile, firstname, utmb: index },
    });
  const athlete = { id: 42, firstname: 'alice', lastname: 'TRAIL' };
  it('prefers the signed-in athlete workspace over the local profile', () => {
    expect(
      readRunnerProfile(
        storage({ [seasonStorageKey(42)]: serialized(700), [seasonStorageKey()]: serialized(600) }),
        athlete,
      )?.utmb,
    ).toBe(700);
  });
  it('finds the local index for the same athlete after Strava sign-in', () => {
    expect(
      readRunnerProfile(storage({ [seasonStorageKey()]: serialized(600) }), athlete)?.utmb,
    ).toBe(600);
  });
  it('does not expose another runner’s local profile on an athlete dashboard', () => {
    expect(
      readRunnerProfile(storage({ [seasonStorageKey()]: serialized(600, 'Bob') }), athlete),
    ).toBeNull();
    expect(
      readRunnerProfile(storage({ [seasonStorageKey()]: serialized(600) }), { id: 42 }),
    ).toBeNull();
  });
  it('reads the local profile independently from the demo activities', () => {
    expect(readRunnerProfile(storage({ [seasonStorageKey()]: serialized(600) }))?.utmb).toBe(600);
  });
  it('handles blocked storage, corrupt backups and out-of-range indices', () => {
    expect(
      readRunnerProfile({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeNull();
    for (const value of ['{bad', 'null', serialized(1001)])
      expect(readRunnerProfile(storage({ [seasonStorageKey()]: value }))).toBeNull();
  });
});
