import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monthDays } from '@/lib/trail/calendar';
import { racePhotoSchema, seasonSchema } from '@/lib/trail/types';

const fixture = JSON.parse(readFileSync('packages/contracts/trail-v1.json', 'utf8'));
describe('season calendar', () => {
  it('aligns Sunday starts to a Monday-first grid without dropping the last week', () => {
    const days = monthDays(2026, 2);
    expect(days.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(days[6]).toBe('2026-03-01');
    expect(days[36]).toBe('2026-03-31');
    expect(days).toHaveLength(42);
  });
  it('handles leap years and months starting on Monday', () => {
    expect(monthDays(2028, 1).filter(Boolean)).toHaveLength(29);
    expect(monthDays(2027, 1).filter(Boolean)).toHaveLength(28);
    expect(monthDays(2027, 1)[0]).toBe('2027-02-01');
    expect(monthDays(2027, 1)).toHaveLength(28);
  });
});
describe('race photos in season backups', () => {
  it('loads older seasons and preserves added and removed photos across serialization', () => {
    const season = seasonSchema.parse(fixture.season);
    const photo = 'data:image/jpeg;base64,/9j/2Q==';
    season.races[0].photo = photo;
    expect(seasonSchema.parse(JSON.parse(JSON.stringify(season))).races[0].photo).toBe(photo);
    season.races[0].photo = null;
    expect(seasonSchema.parse(JSON.parse(JSON.stringify(season))).races[0].photo).toBeNull();
  });
  it('rejects external URLs, active image formats and oversized embedded photos', () => {
    for (const photo of [
      'https://example.com/photo.jpg',
      'data:image/svg+xml;base64,AAAA',
      'data:image/jpeg;base64,' + 'A'.repeat(100000),
    ]) {
      expect(racePhotoSchema.safeParse(photo).success).toBe(false);
    }
  });
});
