export type DateRange = { from: string; to: string };
export type DashboardPeriod = number | DateRange;
const DAY = 86400;
function timestamp(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Renseigne deux dates valides.');
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value || time < 0)
        throw new Error('Renseigne deux dates valides, à partir de 1970.');
    return time / 1000;
}
export function resolvePeriod(period: DashboardPeriod, now = new Date()) {
    if (typeof period === 'number') {
        if (![90, 180, 365].includes(period)) throw new Error('Choisis une période valide.');
        const before = Math.floor(now.getTime() / 1000);
        const after = before - period * DAY;
        return {
            from: new Date(after * 1000).toISOString().slice(0, 10),
            to: now.toISOString().slice(0, 10),
            after,
            before,
            days: period,
            custom: false,
        };
    }
    const start = timestamp(period.from),
        end = timestamp(period.to);
    if (end < start) throw new Error('La date de fin doit être après la date de début.');
    const days = (end - start) / DAY + 1;
    const latestDay =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000 + DAY;
    if (end > latestDay) throw new Error('La date de fin ne peut pas être dans le futur.');
    // Fetch an extra day at each boundary, then filter using each activity's local date.
    return { ...period, after: start - DAY, before: end + 2 * DAY, days, custom: true };
}
export function periodQuery(period: DashboardPeriod) {
    return new URLSearchParams(
        typeof period === 'number' ? { days: String(period) } : period,
    ).toString();
}
