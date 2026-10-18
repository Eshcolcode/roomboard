// iCal (RFC 5545) import/export for extra properties. Pure: no DOM, no store, so the very same file runs in the
// app, the unit tests and the Supabase edge functions (copied to supabase/functions/_shared/ical.ts; a unit test
// checks the two stay identical).
//
// Calendar days are Europe/London, half-open like stays: `from` is the first night, `to` is the check-out day.
// - All-day events (VALUE=DATE): DTEND is already exclusive, so it is the check-out day as it stands.
// - Timed events (UTC "Z", TZID=… or floating): each end is turned into its London calendar day.
// - All-day events sent as local midnights (SuperControl: DTSTART;TZID=Europe/London:20261116T000000 plus
//   X-MICROSOFT-CDO-ALLDAYEVENT:TRUE) are read as plain dates, so a clock change can never shift them a day.
// - Bookings and "Closed" / owner blocks are all unavailable. Cancelled events are ignored, and so are free
//   (TRANSPARENT) ones unless they say closed / unavailable / blocked.
// - The same UID twice (an updated event) counts once: the highest SEQUENCE, else the later one, wins.
// - Only dates are kept. Summaries, descriptions and guest names are read past and never stored.

export interface IcsEvent {
  uid: string;
  from: string; // first night, yyyy-mm-dd
  to: string; // check-out day (exclusive)
}
export interface Range {
  from: string;
  to: string;
}

const LONDON = 'Europe/London';
const dayMs = 864e5;
const plusDays = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd) + n * dayMs).toISOString().slice(0, 10);
};

/** Calendar day of an instant in a time zone. */
function dayIn(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(ms),
  );
}
/** Offset (ms) of a time zone at an instant: local wall time minus UTC. */
function offsetAt(ms: number, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const g = (t: string) => +(p.find(x => x.type === t)?.value ?? 0);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
}
/** Wall-clock time in a zone → instant. Two passes settle the offset across a clock change. */
function wallToMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ms = guess - offsetAt(guess, tz);
  ms = guess - offsetAt(ms, tz);
  return ms;
}
const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}
function parseLine(line: string): Prop | null {
  // NAME;PARAM=VAL;PARAM="V:AL":value — the first colon outside quotes ends the parameters
  let q = false;
  let i = 0;
  for (; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === ':' && !q) break;
  }
  if (i >= line.length) return null;
  const [name, ...ps] = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of ps) {
    const k = p.indexOf('=');
    if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1).trim() };
}

type When = { allDay: true; day: string } | { allDay: false; ms: number };
function parseWhen(p: Prop, allDayHint = false): When | null {
  const v = p.value;
  const d = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  // an all-day event written as a local (not UTC) midnight: keep the wall date as it is
  const midnight = !v.endsWith('Z') && /^\d{8}T000000$/.test(v);
  if (d || p.params.VALUE === 'DATE' || (allDayHint && midnight)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? { allDay: true, day: `${m[1]}-${m[2]}-${m[3]}` } : null;
  }
  const t = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!t) return null;
  const [y, mo, dd, h, mi, s] = [t[1], t[2], t[3], t[4], t[5], t[6] ?? '0'].map(Number);
  if (t[7]) return { allDay: false, ms: Date.UTC(y, mo - 1, dd, h, mi, s) };
  const tz = p.params.TZID && validZone(p.params.TZID) ? p.params.TZID : LONDON; // floating time = London
  return { allDay: false, ms: wallToMs(y, mo, dd, h, mi, s, tz) };
}
function addDuration(w: When, dur: string): When | null {
  const m = dur.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const days = +(m[1] ?? 0) * 7 + +(m[2] ?? 0);
  const ms = (+(m[3] ?? 0) * 3600 + +(m[4] ?? 0) * 60 + +(m[5] ?? 0)) * 1000;
  if (w.allDay) return { allDay: true, day: plusDays(w.day, days) };
  return { allDay: false, ms: w.ms + days * dayMs + ms };
}
const dayOf = (w: When) => (w.allDay ? w.day : dayIn(w.ms, LONDON));

const CLOSED = /closed|not available|unavailable|blocked/i;

/** Read an .ics file into unavailable date ranges (dates only, one per UID). */
export function parseICS(text: string): IcsEvent[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '') // unfold continuation lines
    .split('\n');
  const byUid = new Map<string, IcsEvent & { seq: number }>();
  let ev: Prop[] | null = null;
  let depth = 0; // ignore nested blocks such as VALARM inside an event
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    const up = line.toUpperCase();
    if (up === 'BEGIN:VEVENT') {
      ev = [];
      depth = 0;
      continue;
    }
    if (!ev) continue;
    if (up.startsWith('BEGIN:')) depth++;
    else if (up.startsWith('END:') && up !== 'END:VEVENT') depth--;
    else if (up === 'END:VEVENT') {
      const get = (n: string) => ev!.find(p => p.name === n);
      const hint = /^TRUE$/i.test(get('X-MICROSOFT-CDO-ALLDAYEVENT')?.value ?? '');
      const st = get('DTSTART');
      const start = st && parseWhen(st, hint);
      const status = get('STATUS')?.value.toUpperCase();
      const free = get('TRANSP')?.value.toUpperCase() === 'TRANSPARENT' && !CLOSED.test(get('SUMMARY')?.value ?? '');
      if (start && status !== 'CANCELLED' && !free) {
        const en = get('DTEND');
        const dur = get('DURATION');
        let end = en ? parseWhen(en, hint) : dur ? addDuration(start, dur.value) : null;
        if (!end) end = start.allDay ? { allDay: true, day: plusDays(start.day, 1) } : start;
        const from = dayOf(start);
        let to = dayOf(end);
        if (to <= from) to = plusDays(from, 1); // a same-day or zero-length event still blocks that night
        const uid = get('UID')?.value || `${from}/${to}`;
        const seq = +(get('SEQUENCE')?.value ?? 0) || 0;
        const had = byUid.get(uid);
        if (!had || seq >= had.seq) byUid.set(uid, { uid, from, to, seq });
      }
      ev = null;
    } else if (depth === 0) {
      const p = parseLine(line);
      if (p) ev.push(p);
    }
  }
  return [...byUid.values()].map(({ uid, from, to }) => ({ uid, from, to }));
}

/** Merge overlapping or back-to-back ranges (feeds such as freetobook send one event per night). */
export function mergeRanges<T extends Range>(rs: T[]): Range[] {
  const s = [...rs].sort((a, b) => a.from.localeCompare(b.from));
  const out: Range[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) {
      if (r.to > last.to) last.to = r.to;
    } else out.push({ from: r.from, to: r.to });
  }
  return out;
}

/** A feed's link from its server secret (e.g. ICAL_MONADH). Only ICAL_* names are read, so a feed row can never
 * point at another secret. Missing, blank or not-a-link = null = "Calendar not linked yet". */
export function feedLink(envKey: string, env: (k: string) => string | undefined): string | null {
  if (!/^ICAL_[A-Z0-9_]+$/.test(envKey)) return null;
  const v = (env(envKey) ?? '').trim();
  return /^(https?|webcal):\/\/\S+$/i.test(v) ? v.replace(/^webcal:/i, 'https:') : null;
}

const esc = (t: string) => t.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
const compact = (d: string) => d.replace(/-/g, '');
/** Fold to 75 octets per RFC 5545 (continuation lines start with a space). */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** An .ics feed of booked nights for one unit, for Airbnb / Booking.com to import. No names, only "Booked". */
export function exportICS(o: { name: string; host: string; ranges: (Range & { id: string })[]; now?: Date }): string {
  const stamp = (o.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Roomboard//Extra properties//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(o.name)}`,
  ];
  for (const r of [...o.ranges].sort((a, b) => a.from.localeCompare(b.from)))
    lines.push(
      'BEGIN:VEVENT',
      `UID:${esc(r.id)}@${o.host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(r.from)}`,
      `DTEND;VALUE=DATE:${compact(r.to)}`,
      'SUMMARY:Booked',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
