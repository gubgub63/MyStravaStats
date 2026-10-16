import { describe, expect, it } from 'vitest';
import { emptySeason, seasonSchema, type TrailResult } from '@/lib/trail/types';
import { recordProfileIndexes } from '@/lib/trail/index-history';

const result: TrailResult = {
  id: 'utmb-1-1',
  name: 'Trail',
  date: '2026-08-08',
  distanceKm: 30,
  ascentM: 1000,
  seconds: 10800,
  status: 'finished',
  rank: 20,
  finishers: 354,
  utmb: null,
  itra: null,
  source: '',
  terrain: null,
};
const season = () => ({
  ...emptySeason('Enzo', 'Gubbiotti'),
  profile: { ...emptySeason().profile, utmb: 587, itra: 576 },
  results: [result],
});

describe('profile index history', () => {
  it('updates the same day, keeps earlier observations and does not redates ITRA during UTMB import', () => {
    const saved = recordProfileIndexes(season(), '2026-10-14');
    const updated = recordProfileIndexes(
      { ...saved, profile: { ...saved.profile, utmb: 590 } },
      '2026-10-14',
      ['utmb'],
    );
    expect(updated.indexHistory).toHaveLength(2);
    expect(updated.indexHistory.find((p) => p.provider === 'utmb')?.value).toBe(590);
    const next = recordProfileIndexes(updated, '2026-10-15', ['utmb']);
    expect(next.indexHistory).toHaveLength(3);
    expect(next.indexHistory.filter((p) => p.provider === 'itra')).toEqual([
      { date: '2026-10-14', provider: 'itra', value: 576 },
    ]);
    expect(seasonSchema.parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it('accepts older backups and missing indexes without fabricating history', () => {
    const old = { ...season() } as Partial<ReturnType<typeof season>>;
    delete old.indexHistory;
    expect(seasonSchema.parse(old).indexHistory).toEqual([]);
    expect(recordProfileIndexes(emptySeason(), '2026-10-14').indexHistory).toEqual([]);
    expect(
      seasonSchema.safeParse({
        ...season(),
        indexHistory: [{ date: '2026-10-14', provider: 'utmb', value: 1001 }],
      }).success,
    ).toBe(false);
  });
});
