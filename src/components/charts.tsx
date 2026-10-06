'use client';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import type { Aggregation } from '@/lib/dashboard/aggregate';
import { number, secondsToDuration } from '@/lib/utils/units';
export type Metric = 'distanceKm' | 'elevationGainM' | 'movingTimeSeconds';
export const metricLabels: Record<Metric, { title: string; unit: string }> = {
    distanceKm: { title: 'Distance', unit: 'km' },
    elevationGainM: { title: 'Dénivelé positif', unit: 'm' },
    movingTimeSeconds: { title: 'Temps d’activité', unit: 'h' },
};
export default function WeeklyChart({
    weekly,
    metric,
}: {
    weekly: Aggregation['weekly'];
    metric: Metric;
}) {
    const data = weekly.map((w) => ({
        ...w,
        value: metric === 'movingTimeSeconds' ? w[metric] / 3600 : w[metric],
        label: `${w.week.slice(8, 10)}/${w.week.slice(5, 7)}`,
    }));
    return (
        <>
            <div
                className="chart-container"
                role="img"
                aria-label={`${metricLabels[metric].title} par semaine ; valeurs disponibles dans le tableau ci-dessous`}
            >
                <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                    <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="distance-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="var(--blue)" stopOpacity={0.01} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            minTickGap={22}
                            tick={{ fill: 'var(--muted)', fontSize: 11 }}
                            dy={12}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: 'var(--muted)', fontSize: 11 }}
                            width={55}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--surface)',
                                border: '1px solid var(--line)',
                                borderRadius: 8,
                                fontSize: 12,
                                color: 'var(--ink)',
                            }}
                            formatter={(value) => [
                                `${number(Number(value), 1)} ${metricLabels[metric].unit}`,
                                metricLabels[metric].title,
                            ]}
                            labelFormatter={(label) => `Semaine du ${label}`}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="var(--blue)"
                            strokeWidth={2}
                            fill="url(#distance-fill)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <details className="chart-values">
                <summary>Voir les valeurs par semaine</summary>
                <div className="table-scroll">
                    <table>
                        <caption className="sr-only">Statistiques hebdomadaires</caption>
                        <thead>
                            <tr>
                                <th>Semaine du</th>
                                <th>Distance</th>
                                <th>D+</th>
                                <th>Temps</th>
                                <th>Sorties</th>
                            </tr>
                        </thead>
                        <tbody>
                            {weekly.map((w) => (
                                <tr key={w.week}>
                                    <td>{w.week}</td>
                                    <td>{number(w.distanceKm, 1)} km</td>
                                    <td>{number(w.elevationGainM)} m</td>
                                    <td>{secondsToDuration(w.movingTimeSeconds)}</td>
                                    <td>{w.activityCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </>
    );
}
