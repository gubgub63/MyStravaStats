import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  analyzePoints,
  difficulty,
  estimateField,
  parseDuration,
  predictTime,
  type TrackPoint,
} from '@/lib/trail/model';
import { parseFieldCsv } from '@/lib/trail/import';
import {
  emptySeason,
  raceSchema,
  seasonSchema,
  type TrailRace,
  type TrailResult,
} from '@/lib/trail/types';
import {
  fetchCatalogRace,
  fetchRunner,
  searchRunners,
  fetchHistoricalField,
} from '@/lib/trail/providers';
import { comparableHistory } from '@/lib/trail/history';
import { uniqueExactRunner } from '@/lib/trail/identity';

const race: TrailRace = {
  id: 'target',
  name: 'Trail',
  date: '2027-05-07',
  distanceKm: 40,
  ascentM: 2000,
  priority: 'A',
  targetSeconds: 21600,
  terrain: null,
  notes: '',
  source: '',
  catalogId: null,
  track: null,
  field: [],
  fieldLabel: '',
  fieldSource: '',
  fieldEdition: null,
  fieldDistanceKm: null,
  fieldAscentM: null,
  cutoffHours: null,
  organizerTerrain: '',
  sourceCheckedAt: '',
};
const result: TrailResult = {
  id: 'r',
  name: 'Course passée',
  date: '2026-05-07',
  distanceKm: 40,
  ascentM: 2000,
  seconds: 21600,
  status: 'finished',
  rank: null,
  finishers: null,
  utmb: null,
  itra: null,
  source: '',
  terrain: null,
};
const point = (lat: number, elevation: number, segment = 0): TrackPoint => ({
  lat,
  lon: 6,
  elevation,
  segment,
});
afterEach(() => vi.unstubAllGlobals());

describe('trail time and prediction guards', () => {
  it('accepts multi-day times without treating minutes as hours', () => {
    expect(parseDuration('90:30:15')).toBe(325815);
    for (const value of ['06:60', '6:30:60', '0:00', '-1:30', '6.5', 'NaN', '6:3'])
      expect(parseDuration(value)).toBeNull();
  });
  it('does not predict from DNFs, missing times, future or stale results', () => {
    const ineligible = [
      { ...result, status: 'dnf' as const },
      { ...result, seconds: null },
      { ...result, date: '2022-01-01' },
      { ...result, date: '2028-01-01' },
    ];
    expect(predictTime(race, ineligible, '2026-10-13')).toBeNull();
  });
  it('keeps the reference elapsed time for an identical course and widens distant extrapolations', () => {
    const same = predictTime(race, [result], '2026-10-13')!;
    expect(same.central).toBe(21600);
    expect(same.low).toBeLessThan(same.central);
    const far = predictTime({ ...race, distanceKm: 200 }, [result], '2026-10-13')!;
    expect(far.extrapolated).toBe(true);
    expect(far.low / far.central).toBeCloseTo(0.65);
  });
  it('does not assume an unknown terrain is flat', () => {
    const base = predictTime({ ...race, terrain: 4 }, [result], '2026-10-13')!;
    expect(base.central).toBe(21600);
    expect(
      predictTime({ ...race, terrain: 4 }, [{ ...result, terrain: 0 }], '2026-10-13')!.central,
    ).toBeGreaterThan(base.central);
  });
  it('keeps difficulty bounded for an extreme ultra', () => {
    expect(difficulty({ ...race, distanceKm: 900, ascentM: 90000, terrain: 4 })).toBe(100);
  });
});
describe('GPX geometry', () => {
  it('never bridges separate track segments', () => {
    const analysis = analyzePoints([
      point(45, 100),
      point(45.001, 110),
      point(46, 3000, 1),
      point(46.001, 2990, 1),
    ]);
    expect(analysis.distanceKm).toBeCloseTo(0.2224, 3);
    expect(analysis.ascentM).toBe(10);
    expect(analysis.descentM).toBe(10);
  });
  it('rejects gaps, invalid coordinates, short and empty tracks', () => {
    expect(() => analyzePoints([point(45, 100), point(46, 100)])).toThrow('saut GPS');
    expect(() => analyzePoints([point(95, 100), point(95.001, 100)])).toThrow('invalides');
    expect(() => analyzePoints([point(45, 100), point(45.00001, 100)])).toThrow('100 m');
    expect(() => analyzePoints([])).toThrow();
  });
  it('does not turn small elevation noise on a flat route into ascent', () => {
    const analysis = analyzePoints(
      Array.from({ length: 20 }, (_, i) => point(45 + i * 0.0003, 100 + (i % 2))),
    );
    expect(analysis.ascentM).toBe(0);
    expect(analysis.descentM).toBe(0);
    expect(analysis.slopeIndex).toBe(0);
  });
});
describe('historical fields', () => {
  it('handles BOM, semicolons, quoted comma decimals and abandons', () => {
    const field = parseFieldCsv(
      '\uFEFFtime;utmb;itra;status\r\n06:00:00;"500,5";;finished\r\n;;600;dnf\r\n07:00:00;450;470;finished',
    );
    expect(field).toHaveLength(2);
    expect(field[0].utmb).toBe(500.5);
    expect(field[0].itra).toBeNull();
  });
  it('rejects invalid rows rather than silently making rankings incomplete', () => {
    for (const text of [
      'name\nAlice',
      'time,utmb\n6:70:00,600',
      'time,utmb\n6:00:00,1001',
      'time\n"6:00:00',
    ])
      expect(() => parseFieldCsv(text)).toThrow();
  });
  it('respects ties and does not invent scores without enough nearby references', () => {
    const f = [
      { seconds: 100, utmb: null, itra: null },
      { seconds: 200, utmb: 600, itra: null },
      { seconds: 200, utmb: 600, itra: null },
    ];
    const estimate = estimateField(200, f)!;
    expect(estimate.rank).toBe(2);
    expect(estimate.utmb).toBeNull();
    expect(estimate.itra).toBeNull();
    expect(estimateField(300, f)!.rank).toBe(4);
    expect(estimateField(200, [])).toBeNull();
  });
  it('only calibrates the score scale whose source has enough observations', () => {
    const f = [180, 200, 220].map((seconds) => ({ seconds, utmb: 120000 / seconds, itra: null }));
    expect(estimateField(200, f)!.utmb).toBe(600);
    expect(estimateField(200, f)!.itra).toBeNull();
    expect(estimateField(600, f)!.utmb).toBeNull();
  });
});
describe('backup validation', () => {
  it('opens older season backups without losing goals when historical metadata is absent', () => {
    const oldRace = { ...race } as Partial<TrailRace>;
    delete oldRace.fieldSource;
    delete oldRace.fieldEdition;
    delete oldRace.fieldDistanceKm;
    delete oldRace.fieldAscentM;
    const restored = seasonSchema.parse({ ...emptySeason(), races: [oldRace] });
    expect(restored.races[0].name).toBe(race.name);
    expect(restored.races[0].fieldSource).toBe('');
    expect(restored.races[0].fieldDistanceKm).toBeNull();
  });
  it('blocks automatic ranking comparisons after distance or ascent changes', () => {
    const reference = { ...race, fieldDistanceKm: 40, fieldAscentM: 2000 };
    expect(comparableHistory(reference)).toBe(true);
    expect(comparableHistory({ ...reference, distanceKm: 60 })).toBe(false);
    expect(comparableHistory({ ...reference, ascentM: 3000 })).toBe(false);
  });
  it('round-trips seasons and rejects unsafe links and non-finite numbers', () => {
    const season = { ...emptySeason(), races: [race], results: [result] };
    expect(seasonSchema.parse(JSON.parse(JSON.stringify(season)))).toEqual(season);
    expect(raceSchema.safeParse({ ...race, source: 'javascript:alert(1)' }).success).toBe(false);
    expect(raceSchema.safeParse({ ...race, distanceKm: Infinity }).success).toBe(false);
    expect(seasonSchema.safeParse({ ...season, version: 2 }).success).toBe(false);
  });
});
describe('automatic runner lookup', () => {
  it('only imports one exact full-name match, even when fuzzy search returns other runners', () => {
    const exact = { fullname: 'Alice TRAIL', id: 1 };
    expect(
      uniqueExactRunner([exact, { fullname: 'Alice MONTAGNE', id: 2 }], 'Alice', 'Trail'),
    ).toEqual(exact);
    expect(uniqueExactRunner([{ fullname: 'Alice MONTAGNE' }], 'Alice', 'Trail')).toBeNull();
    expect(uniqueExactRunner([exact, { ...exact, id: 3 }], 'Alice', 'Trail')).toBeNull();
  });
  it('normalizes accents and spacing without importing a profile for an incomplete name', () => {
    expect(uniqueExactRunner([{ fullname: 'Élodie TRAIL' }], 'elodie', ' TRAIL ')?.fullname).toBe(
      'Élodie TRAIL',
    );
    expect(uniqueExactRunner([{ fullname: 'Alice TRAIL' }], 'Alice', '')).toBeNull();
  });
});
describe('public provider adapters', () => {
  it('rejects incomplete or repeated ranking pages and imports every finisher without inventing scores', async () => {
    const html = (
      offset: number,
      entries: Array<{ rank: number | null; time: string; index: null }>,
      count = 4,
    ) =>
      new Response(
        `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { name: 'UTLAC 120K 2026', distance: '122.00', elevationGain: 6209, results: { limit: 2, offset, nbHits: count, results: entries.map((r) => ({ ...r, runnerUri: `runner-${r.rank}` })) } } } })}</script>`,
      );
    const json = (
      offset: number,
      entries: Array<{ rank: number | null; time: string; index: null }>,
    ) =>
      new Response(
        JSON.stringify({
          limit: 2,
          offset,
          nbHits: 4,
          results: entries.map((r) => ({ ...r, runnerUri: `runner-${r.rank}` })),
        }),
      );
    const firstRows = [
      { rank: 1, time: '16:26:17', index: null },
      { rank: 2, time: '16:30:08', index: null },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(html(0, firstRows)).mockResolvedValueOnce(json(2, firstRows)),
    );
    await expect(fetchHistoricalField('utlac-120')).rejects.toThrow('changé');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(html(0, firstRows))
        .mockResolvedValueOnce(json(0, firstRows))
        .mockResolvedValueOnce(json(2, [])),
    );
    await expect(fetchHistoricalField('utlac-120')).rejects.toThrow('incomplet');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(html(0, firstRows))
      .mockResolvedValueOnce(json(0, firstRows))
      .mockResolvedValueOnce(
        json(2, [
          { rank: 3, time: '16:37:27', index: null },
          { rank: null, time: 'DNF', index: null },
        ]),
      );
    vi.stubGlobal('fetch', fetch);
    const data = await fetchHistoricalField('utlac-120');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(data.field).toHaveLength(3);
    expect(data.field.every((row) => row.utmb === null && row.itra === null)).toBe(true);
    expect(estimateField(17 * 3600, data.field)!.rank).toBe(4);
    await expect(fetchHistoricalField('http://localhost/admin')).rejects.toThrow(
      'Aucun classement',
    );
  });
  it('extracts organizer data without mixing ITRA qualification points with a performance score', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '<html>122KM - 6.209 MD+ | 07/05/2027 Distanza 122 km Dislivello 6.209 m D+ Tempo max 35 ore Terreno 80% trail Ristori 10 <a href="/map/gpx/UTLAC120K.gpx">GPX</a> 5 punti ITRA</html>',
          ),
        ),
    );
    const value = await fetchCatalogRace('utlac-120');
    expect(value).toMatchObject({
      distanceKm: 122,
      ascentM: 6209,
      date: '2027-05-07',
      cutoffHours: 35,
      gpxUrl: 'https://www.utlactrail.com/map/gpx/UTLAC120K.gpx',
    });
    expect(value).not.toHaveProperty('itra');
    await expect(fetchCatalogRace('http://localhost')).rejects.toThrow('inconnue');
  });
  it('requires a valid provider response instead of treating a provider failure as no runners', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(searchRunners('Alice', 'Trail')).rejects.toThrow();
  });
  it('imports public results while preserving absent per-race scores', async () => {
    const props = {
      fullname: 'Alice TRAIL',
      performanceIndexes: [{ piCategory: 'general', index: 600 }],
      results: {
        results: [
          {
            raceYearId: 1,
            race: 'Trail 2026',
            dateIso: '2026-05-01',
            distance: '40.0',
            elevationGain: 2000,
            time: '06:00:00',
            isDnf: false,
            rank: 42,
            totalRanked: 300,
            index: null,
          },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: props } })}</script>`,
          ),
        ),
    );
    const runner = await fetchRunner('123.alice.trail');
    expect(runner.utmb).toBe(600);
    expect(runner.results[0]).toMatchObject({ seconds: 21600, utmb: null, itra: null });
    await expect(fetchRunner('../admin')).rejects.toThrow('invalide');
  });
});
