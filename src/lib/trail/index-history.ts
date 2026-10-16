import type { Season } from './types';

/** Record an observation, never assign a general index to a race or a past season. */
export function recordProfileIndexes(
  season: Season,
  date: string,
  providers: ('utmb' | 'itra')[] = ['utmb', 'itra'],
): Season {
  const history = [...season.indexHistory];
  for (const provider of providers) {
    const value = season.profile[provider];
    if (value === null) continue;
    const index = history.findIndex((p) => p.date === date && p.provider === provider);
    const observation = { date, provider, value };
    if (index === -1) history.push(observation);
    else history[index] = observation;
  }
  return { ...season, indexHistory: history.sort((a, b) => a.date.localeCompare(b.date)) };
}
