export const metersToKm = (meters: number) => meters / 1000;
export const metersPerSecondToKmH = (speed: number) => speed * 3.6;
export const metersPerSecondToPace = (speed: number) => (speed > 0 ? 1000 / speed : null);
export const number = (n: number, digits = 0) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(n);
export function secondsToDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
    : `${minutes} min`;
}
export function pace(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
export function localDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(date.slice(0, 19) + 'Z'));
}
