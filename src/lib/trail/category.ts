import type { TrailRace } from './types';

export type UtmbCategory = '20K' | '50K' | '100K' | '100M';
export const utmbCategories: UtmbCategory[] = ['100M', '100K', '50K', '20K'];

export function countRaceCategories(races: Parameters<typeof raceCategory>[0][]) {
  return utmbCategories.map((category) => {
    const matches = races.map(raceCategory).filter((result) => result?.category === category);
    return {
      category,
      count: matches.length,
      estimated: matches.filter((result) => result?.estimated).length,
    };
  });
}

// Categories published by the organizer: https://www.utlactrail.com/gare/
export const catalogCategories: Record<string, UtmbCategory> = {
  'utlac-120': '100M',
  'utlac-250': '100M',
  'utlac-60': '100K',
  'utlac-30': '50K',
  'utlac-15': '20K',
};

export function raceCategory(
  race: Pick<TrailRace, 'catalogId' | 'name' | 'distanceKm' | 'ascentM'>,
) {
  const knownId =
    race.catalogId ??
    (/\butlac\b/i.test(race.name)
      ? `utlac-${race.name.match(/\b(250|120|60|30|15)\s*k?\b/i)?.[1]}`
      : '');
  const official = Object.hasOwn(catalogCategories, knownId) ? catalogCategories[knownId] : null;
  if (official) return { category: official, estimated: false };
  const effort = race.distanceKm + race.ascentM / 100;
  const category: UtmbCategory | null =
    effort >= 175
      ? '100M'
      : effort >= 100
        ? '100K'
        : effort >= 50
          ? '50K'
          : effort >= 20
            ? '20K'
            : null;
  return category ? { category, estimated: true } : null;
}
