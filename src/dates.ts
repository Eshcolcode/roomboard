// All dates are calendar days in Europe/London, stored as 'YYYY-MM-DD'.
// Stays are half-open: arrival inclusive, departure exclusive (the night of departure is NOT occupied).
export const TZ = 'Europe/London';
export function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const toUTC = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
export const addDays = (d: string, n: number) => new Date(toUTC(d) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
export const fmt = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(toUTC(d)).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
export const INF = '9999-12-31';
export const overlaps = (a1: string, a2: string | null, b1: string, b2: string | null) => a1 < (b2 ?? INF) && b1 < (a2 ?? INF);
export const nowLondon = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
