import type { DashboardActivity } from '@/lib/strava/normalize';
export const isRunning = (sport: string) => ['Run', 'TrailRun', 'VirtualRun'].includes(sport);
export function isoWeek(date: string) {
  const day = new Date(date.slice(0, 10) + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export function aggregate(activities: DashboardActivity[], from: string, to: string) {
  const summary = {
    distanceKm: 0,
    elevationGainM: 0,
    movingTimeSeconds: 0,
    activityCount: activities.length,
  };
  const weeks = new Map<string, typeof summary & { week: string }>();
  for (
    let day = new Date(isoWeek(from) + 'T12:00:00Z');
    day.toISOString().slice(0, 10) <= isoWeek(to);
    day.setUTCDate(day.getUTCDate() + 7)
  ) {
    const week = day.toISOString().slice(0, 10);
    weeks.set(week, {
      week,
      distanceKm: 0,
      elevationGainM: 0,
      movingTimeSeconds: 0,
      activityCount: 0,
    });
  }
  const sports = new Map<
    string,
    { sport: string; count: number; distanceKm: number; movingTimeSeconds: number }
  >();
  for (const a of activities) {
    summary.distanceKm += a.distanceKm;
    summary.elevationGainM += a.elevationGainM;
    summary.movingTimeSeconds += a.movingTimeSeconds;
    const week = weeks.get(isoWeek(a.localDate));
    if (week) {
      week.distanceKm += a.distanceKm;
      week.elevationGainM += a.elevationGainM;
      week.movingTimeSeconds += a.movingTimeSeconds;
      week.activityCount++;
    }
    const sport = sports.get(a.sportType) ?? {
      sport: a.sportType,
      count: 0,
      distanceKm: 0,
      movingTimeSeconds: 0,
    };
    sport.count++;
    sport.distanceKm += a.distanceKm;
    sport.movingTimeSeconds += a.movingTimeSeconds;
    sports.set(a.sportType, sport);
  }
  const runs = activities.filter((a) => isRunning(a.sportType));
  const runningDistance = runs.reduce((n, a) => n + a.distanceKm, 0);
  const runningTime = runs.reduce((n, a) => n + a.movingTimeSeconds, 0);
  const runningElevation = runs.reduce((n, a) => n + a.elevationGainM, 0);
  // Effort distance: 1 km per 100 m ascent. This is an approximation, not Strava GAP.
  const effortDistance = runningDistance + runningElevation / 100;
  return {
    summary,
    weekly: [...weeks.values()],
    sports: [...sports.values()].sort((a, b) => b.movingTimeSeconds - a.movingTimeSeconds),
    recentActivities: [...activities].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    running: {
      count: runs.length,
      distanceKm: runningDistance,
      elevationGainM: runningElevation,
      movingTimeSeconds: runningTime,
      paceSecondsPerKm: runningDistance > 0 ? runningTime / runningDistance : null,
      speedKmH: runningTime > 0 ? runningDistance / (runningTime / 3600) : null,
      speedKmMin: runningTime > 0 ? runningDistance / (runningTime / 60) : null,
      effortPace: effortDistance > 0 ? runningTime / effortDistance : null,
      longestRunKm: Math.max(0, ...runs.map((a) => a.distanceKm)),
      highestElevationM: Math.max(0, ...runs.map((a) => a.elevationGainM)),
    },
  };
}
export type Aggregation = ReturnType<typeof aggregate>;
