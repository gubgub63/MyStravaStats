import { describe, expect, it } from 'vitest';
import { raceCategory, countRaceCategories } from '@/lib/trail/category';

describe('race category badges', () => {
  it('counts each course once and identifies estimates, keeping empty categories', () => {
    const race = { catalogId: 'utlac-120', name: 'UTLAC', distanceKm: 120, ascentM: 6200 };
    expect(countRaceCategories([race, { ...race, catalogId: null, name: 'Trail' }])).toEqual([
      { category: '100M', count: 2, estimated: 1 },
      { category: '100K', count: 0, estimated: 0 },
      { category: '50K', count: 0, estimated: 0 },
      { category: '20K', count: 0, estimated: 0 },
    ]);
    expect(countRaceCategories([]).every(({ count }) => count === 0)).toBe(true);
  });
  it.each([
    ['utlac-120', '100M'],
    ['utlac-250', '100M'],
    ['utlac-60', '100K'],
    ['utlac-30', '50K'],
    ['utlac-15', '20K'],
  ])('uses the organizer category for %s', (catalogId, category) => {
    expect(raceCategory({ catalogId, name: 'UTLAC', distanceKm: 1, ascentM: 0 })).toEqual({
      category,
      estimated: false,
    });
  });
  it('recognizes manually entered UTLAC formats', () => {
    expect(
      raceCategory({ catalogId: null, name: 'UTLAC 120K', distanceKm: 120, ascentM: 5500 }),
    ).toEqual({ category: '100M', estimated: false });
  });
  it('marks other courses as estimates and uses elevation as well as distance', () => {
    expect(raceCategory({ catalogId: null, name: 'Trail', distanceKm: 60, ascentM: 4000 })).toEqual(
      { category: '100K', estimated: true },
    );
    expect(raceCategory({ catalogId: null, name: 'Trail', distanceKm: 10, ascentM: 0 })).toBeNull();
  });
});
