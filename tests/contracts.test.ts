import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { seasonSchema } from '@/lib/trail/types';
import {
  effortKm,
  difficulty,
  predictTime,
  estimateLevels,
  estimateField,
  analyzePoints,
} from '@/lib/trail/model';
import { parseFieldCsv } from '@/lib/trail/import';
const fixture = JSON.parse(readFileSync('packages/contracts/trail-v1.json', 'utf8'));
describe('shared Swift/TypeScript contracts', () => {
  it('matches the reference season and all prediction outputs', () => {
    const season = seasonSchema.parse(fixture.season),
      race = season.races[0],
      expected = fixture.expected;
    expect(effortKm(race.distanceKm, race.ascentM)).toBe(expected.effort);
    expect(difficulty(race)).toBe(expected.difficulty);
    const prediction = predictTime(race, season.results, fixture.today)!;
    expect(prediction.central).toBeCloseTo(expected.prediction, 7);
    expect(prediction.low).toBeCloseTo(expected.low, 7);
    expect(prediction.high).toBeCloseTo(expected.high, 7);
    const levels = estimateLevels(race, season.results, season.profile, fixture.today);
    expect(levels.utmb).toMatchObject({
      value: expected.level,
      low: expected.lowLevel,
      high: expected.highLevel,
      method: 'personal',
    });
    expect(levels.itra).toBeNull();
  });
  it('matches GPX and CSV references', () => {
    const track = analyzePoints(fixture.points);
    expect(track.distanceKm).toBeCloseTo(fixture.trackExpected.distanceKm, 7);
    expect(track.ascentM).toBe(40);
    expect(track.descentM).toBe(0);
    expect(track.slopeIndex).toBe(0);
    const field = parseFieldCsv(fixture.csv);
    expect(field).toEqual(fixture.field);
    expect(estimateField(61200, field)).toEqual({ ...fixture.fieldExpected, itra: null });
  });
  it('rejects duplicate identities instead of silently collapsing imports', () => {
    expect(
      seasonSchema.safeParse({
        ...fixture.season,
        results: [...fixture.season.results, ...fixture.season.results],
      }).success,
    ).toBe(false);
  });
});
