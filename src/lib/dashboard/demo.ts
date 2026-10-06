import { aggregate } from './aggregate';
import type { DashboardActivity } from '@/lib/strava/normalize';
import type { DashboardData } from './types';
export function demoData(days = 90, now = new Date()): DashboardData {
  const activities: DashboardActivity[] = [];
  const count = Math.floor(days / 3.5);
  for (let i = 0; i < count; i++) {
    const day = new Date(now.getTime() - (i * 3 + (i % 3)) * 86400000);
    day.setUTCHours(8, 30, 0, 0);
    const sportType = i % 7 === 3 ? 'Ride' : i % 3 === 0 ? 'TrailRun' : 'Run';
    const distanceKm = sportType === 'Ride' ? 32 + (i % 17) : 7 + ((i * 7) % 19);
    const elevationGainM =
      sportType === 'TrailRun' ? 380 + ((i * 39) % 700) : 40 + ((i * 13) % 160);
    const movingTimeSeconds = Math.round(
      distanceKm * (sportType === 'Ride' ? 155 : sportType === 'TrailRun' ? 410 : 315),
    );
    activities.push({
      id: i + 1,
      name:
        sportType === 'TrailRun'
          ? ['Les sentiers du Puy de Dôme', 'Un tour dans les volcans', 'Sur les crêtes'][i % 3]
          : sportType === 'Ride'
            ? 'À vélo, au grand air'
            : [
                'Footing du matin',
                'La sortie du dimanche',
                'Un peu de rythme',
                'Au fil de l’Allier',
              ][i % 4],
      sportType,
      distanceKm,
      elevationGainM,
      movingTimeSeconds,
      startDate: day.toISOString(),
      localDate: day.toISOString(),
      averageSpeedMps: (distanceKm * 1000) / movingTimeSeconds,
      paceSecondsPerKm: movingTimeSeconds / distanceKm,
    });
  }
  return {
    ...aggregate(
      activities,
      new Date(now.getTime() - days * 86400000).toISOString(),
      now.toISOString(),
    ),
    athlete: { id: 1, firstname: 'Camille' },
    days,
    fetchedAt: now.toISOString(),
    cacheExpiresAt: new Date(now.getTime() + 600000).toISOString(),
    partial: false,
    rateLimit: null,
  };
}
