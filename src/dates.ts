// All dates are calendar days in Europe/London, stored as 'YYYY-MM-DD'.
// Stays are half-open: arrival inclusive, departure exclusive (the night of departure is NOT occupied).
export const TZ = 'Europe/London';
export function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}
const toUTC = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};
export const addDays = (d: string, n: number) => new Date(toUTC(d) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
export const fmt = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(toUTC(d)).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
export const INF = '9999-12-31';
export const overlaps = (a1: string, a2: string | null, b1: string, b2: string | null) =>
  a1 < (b2 ?? INF) && b1 < (a2 ?? INF);
export const nowLondon = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
/** dd/mm/yyyy, the format used in every date field. */
export const fmtUK = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
/** Parse dd/mm/yyyy (also d/m/yy, dashes or dots). Returns ISO yyyy-mm-dd or null. */
export function parseUK(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const dd = +m[1],
    mm = +m[2],
    yy = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return dt.toISOString().slice(0, 10);
}
/** '2026-11-06' -> '6 Nov' ('6 Nov 2027' when not this year), the friendly form used in activity and alert text. */
export function friendlyDate(d: string, today: string = londonToday()): string {
  const s = fmt(d, { day: 'numeric', month: 'short' });
  return d.slice(0, 4) === today.slice(0, 4) ? s : `${s} ${d.slice(0, 4)}`;
}
/** Activity, alert and message text: ISO dates become friendly dates; 'Mon 02 Nov' loses its leading zero. */
export function friendlyDates(t: string, today: string = londonToday()): string {
  return t
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => {
      const iso = `${y}-${mo}-${d}`;
      return parseUK(`${d}/${mo}/${y}`) === iso ? friendlyDate(iso, today) : m;
    })
    .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) 0([1-9]) (?=[A-Z][a-z]{2}\b)/g, '$1 $2 ');
}
