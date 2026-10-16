'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrackAnalysis } from '@/lib/trail/types';

const tick = { fill: 'var(--muted)', fontSize: 11 };
const tooltip = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  color: 'var(--ink)',
  fontSize: 12,
};
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
