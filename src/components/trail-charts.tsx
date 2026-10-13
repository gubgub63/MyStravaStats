'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrackAnalysis, TrailResult } from '@/lib/trail/types';
import { effortKm } from '@/lib/trail/model';

const tick = { fill: 'var(--muted)', fontSize: 11 };
const tooltip = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  color: 'var(--ink)',
  fontSize: 12,
};
export function ProgressChart({
  results,
  metric,
}: {
  results: TrailResult[];
  metric: 'speed' | 'utmb' | 'itra';
}) {
  const data = results
    .filter((r) => r.status === 'finished' && (metric === 'speed' ? r.seconds : r[metric] !== null))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      name: r.name,
      date: r.date,
      value:
        metric === 'speed'
          ? Number((effortKm(r.distanceKm, r.ascentM) / (r.seconds! / 3600)).toFixed(2))
          : r[metric],
    }));
  if (!data.length)
    return (
      <div className="trail-chart-empty">
        {metric === 'speed'
          ? 'Ajoute un résultat avec son temps pour dessiner ta progression.'
          : `Aucun score ${metric.toUpperCase()} publié ou renseigné pour ces résultats.`}
      </div>
    );
  return (
    <div className="trail-chart" aria-label="Progression des résultats ; détails dans le tableau">
      <ResponsiveContainer width="100%" height="100%" minWidth={1}>
        <LineChart
          data={data}
          margin={{ left: 0, right: 16, top: 15, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={tick}
            tickFormatter={(s) =>
              new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', {
                month: 'short',
                year: '2-digit',
              })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={42}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={tooltip}
            labelFormatter={(_, payload) => payload[0]?.payload?.name ?? ''}
            formatter={(value) => [
              `${value} ${metric === 'speed' ? 'km-effort/h' : 'pts'}`,
              metric === 'speed' ? 'Vitesse effort' : `Score ${metric.toUpperCase()}`,
            ]}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke="var(--trail-accent)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ElevationChart({ track }: { track: TrackAnalysis }) {
  return (
    <div className="trail-elevation" aria-label="Profil altimétrique de la trace GPX">
      <ResponsiveContainer width="100%" height="100%" minWidth={1}>
        <AreaChart
          data={track.profile}
          margin={{ left: 0, right: 12, top: 10, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="km"
            type="number"
            domain={[0, 'dataMax']}
            tick={tick}
            tickFormatter={(v) => `${Math.round(v)} km`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={tick}
            tickFormatter={(v) => `${v} m`}
            width={56}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltip}
            labelFormatter={(v) => `${Number(v).toFixed(1)} km`}
            formatter={(v) => [`${Math.round(Number(v))} m`, 'Altitude']}
          />
          <Area
            type="linear"
            dataKey="elevation"
            stroke="var(--trail-accent)"
            fill="var(--trail-accent)"
            fillOpacity={0.12}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function RouteDrawing({ track }: { track: TrackAnalysis }) {
  const lat = track.profile.map((p) => p.lat),
    lon = track.profile.map((p) => p.lon);
  const minLat = Math.min(...lat),
    maxLat = Math.max(...lat),
    minLon = Math.min(...lon),
    maxLon = Math.max(...lon);
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const scale = 132 / Math.max((maxLon - minLon) * cos, maxLat - minLat, 0.00001);
  const x = (l: number) => 14 + (l - minLon) * cos * scale;
  const y = (l: number) => 146 - (l - minLat) * scale;
  const path = track.profile
    .map(
      (p, i) =>
        `${i === 0 || p.segment !== track.profile[i - 1].segment ? 'M' : 'L'}${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      className="trail-route"
      viewBox="0 0 160 160"
      role="img"
      aria-label="Tracé GPX, vue de dessus sans fond de carte"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--trail-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx={x(lon[0])} cy={y(lat[0])} r="4" fill="var(--trail-accent)" />
      <circle
        cx={x(lon.at(-1)!)}
        cy={y(lat.at(-1)!)}
        r="4"
        fill="var(--surface)"
        stroke="var(--trail-accent)"
        strokeWidth="2"
      />
    </svg>
  );
}
