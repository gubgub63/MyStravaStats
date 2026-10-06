import { describe, expect, it } from 'vitest';
import { resolvePeriod, periodQuery } from '@/lib/dashboard/period';
import { demoData } from '@/lib/dashboard/demo';
describe('custom date ranges', () => {
  it('includes both selected dates and allows a single day', () => {
    const range = resolvePeriod({ from: '2024-02-29', to: '2024-02-29' });
    expect(range.days).toBe(1);
    expect(range.after).toBe(Date.parse('2024-02-28T00:00:00Z') / 1000);
    expect(range.before).toBe(Date.parse('2024-03-02T00:00:00Z') / 1000);
  });
  it.each([
    { from: '2025-02-29', to: '2025-03-01' },
    { from: '2025-04-31', to: '2025-05-01' },
    { from: '2025-02-01', to: '2025-01-01' },
    { from: '', to: '2025-01-01' },
    { from: '1969-12-31', to: '2025-01-01' },
    { from: '2000-01-01', to: '9999-01-01' },
  ])('rejects invalid or excessive range %j', (range) => {
    expect(() => resolvePeriod(range)).toThrow();
  });
  it('builds custom queries and creates historical demo weeks for the chosen dates', () => {
    expect(periodQuery({ from: '2024-01-01', to: '2024-01-31' })).toBe(
      'from=2024-01-01&to=2024-01-31',
    );
    const data = demoData(
      { from: '2024-01-01', to: '2024-01-31' },
      new Date('2026-10-06T12:00:00Z'),
    );
    expect(data.days).toBe(31);
    expect(data.weekly).toHaveLength(5);
    expect(data.recentActivities.every((a) => a.localDate.startsWith('2024-01'))).toBe(true);
    expect(demoData({ from: '2024-01-01', to: '2024-01-01' }).summary.activityCount).toBe(1);
  });
});
