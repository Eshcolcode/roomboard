// Shift patterns (27 Oct 2026). A pattern is set up once ('10 on / 4 off, Mon start') and applied to a stay with the
// date its first on-day falls. The room stays taken for the whole stay: a pattern only says which nights the person
// is IN (sleeping there) and which they are AWAY (room kept, their things stay). Availability, iCal and cleaning
// rules never look at it. Pure date maths here; mirrored by nothing on the server (the server only stores rows).
import { addDays, diffDays } from '../dates';

export interface ShiftPattern {
  id: string;
  name: string;
  on: number; // days in
  off: number; // days away
  startDow: number; // weekday of the first on-day: 0 = Sunday … 6 = Saturday
}
export type DayState = 'in' | 'away';
export interface StayShift {
  stayId: string;
  patternId: string;
  cycleStart: string; // a first on-day; the cycle repeats every (on + off) days from here
  overrides: Record<string, DayState>; // one-off days, e.g. back a day early
}
type StayDates = { arrival: string; departure: string | null };

export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

/** 'In 10 days, away 4 · starts Monday' */
export const patternSummary = (p: Pick<ShiftPattern, 'on' | 'off' | 'startDow'>) =>
  `In ${p.on} day${p.on === 1 ? '' : 's'}, away ${p.off} · starts ${DOW[p.startDow]}`;

/** The first day on or after `from` that falls on the pattern's start weekday. */
export function defaultCycleStart(from: string, startDow: number) {
  return addDays(from, (startDow - dowOf(from) + 7) % 7);
}

/**
 * In or away on night d. null = not part of the stay (before arrival, or the departure day and after).
 * Nights before the cycle starts count as in (they arrived before their first rota day). A one-off day wins.
 */
export function dayState(
  stay: StayDates,
  p: Pick<ShiftPattern, 'on' | 'off'> | null | undefined,
  sh: Pick<StayShift, 'cycleStart' | 'overrides'> | null | undefined,
  d: string,
): DayState | null {
  if (d < stay.arrival || (stay.departure && d >= stay.departure)) return null;
  const o = sh?.overrides?.[d];
  if (o === 'in' || o === 'away') return o;
  if (!p || !sh || d < sh.cycleStart) return 'in';
  const len = p.on + p.off;
  if (len <= 0 || p.on <= 0) return 'in';
  const i = ((diffDays(sh.cycleStart, d) % len) + len) % len;
  return i < p.on ? 'in' : 'away';
}

/** Runs of away nights [from, to) inside [winFrom, winTo), for drawing. Open-ended stays stop at winTo. */
export function awayRuns(
  stay: StayDates,
  p: Pick<ShiftPattern, 'on' | 'off'> | null | undefined,
  sh: Pick<StayShift, 'cycleStart' | 'overrides'> | null | undefined,
  winFrom: string,
  winTo: string,
): { from: string; to: string }[] {
  if (!sh) return [];
  const out: { from: string; to: string }[] = [];
  const a = stay.arrival > winFrom ? stay.arrival : winFrom;
  const b = stay.departure && stay.departure < winTo ? stay.departure : winTo;
  let cur: { from: string; to: string } | null = null;
  for (let d = a; d < b; d = addDays(d, 1)) {
    if (dayState(stay, p, sh, d) === 'away') {
      if (cur && cur.to === d) cur.to = addDays(d, 1);
      else out.push((cur = { from: d, to: addDays(d, 1) }));
    }
  }
  return out;
}

/** Next night on or after d that they are in again (for 'back Mon 3 Nov'); null if not within the stay / a year. */
export function nextIn(
  stay: StayDates,
  p: Pick<ShiftPattern, 'on' | 'off'> | null | undefined,
  sh: Pick<StayShift, 'cycleStart' | 'overrides'> | null | undefined,
  d: string,
): string | null {
  for (let i = 0; i < 400; i++) {
    const x = addDays(d, i);
    const s = dayState(stay, p, sh, x);
    if (s === null) return null;
    if (s === 'in') return x;
  }
  return null;
}

/** Flip one night; a flip back to what the pattern says removes the one-off. */
export function flipDay(
  stay: StayDates,
  p: Pick<ShiftPattern, 'on' | 'off'> | null | undefined,
  sh: StayShift,
  d: string,
): Record<string, DayState> {
  const now = dayState(stay, p, sh, d);
  const plain = dayState(stay, p, { ...sh, overrides: {} }, d);
  const want: DayState = now === 'in' ? 'away' : 'in';
  const o = { ...sh.overrides };
  if (want === plain) delete o[d];
  else o[d] = want;
  return o;
}
