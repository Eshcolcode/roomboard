// Extra properties (Harris and Uig pods, Abhainn Cottage, Monadh): availability per day, the iCal export of one unit,
// and clashes between calendar blocks and bookings. Pure helpers over a DB snapshot.
import { addDays, diffDays, londonToday, overlaps } from '../dates';
import type { Block, DB, Stay } from './core';
import { exportICS, mergeRanges } from './ical';

export type DayState = 'free' | 'taken' | 'elsewhere';

export const extraProps = (db: DB) => db.properties.filter(p => !p.contracted);
export const unitOf = (db: DB, propertyId: string) => db.rooms.find(r => r.propertyId === propertyId);
const live = (db: DB, roomId: string) => db.stays.filter(s => s.roomId === roomId);

/** What a night looks like on one unit. Nobody's name is ever part of this. */
export function dayState(db: DB, roomId: string, d: string): DayState {
  const n = addDays(d, 1);
  const st = live(db, roomId).find(s => overlaps(s.arrival, s.departure, d, n));
  if (st) return 'taken';
  if ((db.blocks ?? []).some(b => b.roomId === roomId && overlaps(b.from, b.to, d, n))) return 'elsewhere';
  return 'free';
}
/** True when every night of [from, to) is free. */
export function rangeFree(db: DB, roomId: string, from: string, to: string): boolean {
  for (let d = from; d < to; d = addDays(d, 1)) if (dayState(db, roomId, d) !== 'free') return false;
  return true;
}
/** First free night on or after `from` (within a year), or null. */
export function nextFree(db: DB, roomId: string, from: string): string | null {
  for (let i = 0, d = from; i < 366; i++, d = addDays(d, 1)) if (dayState(db, roomId, d) === 'free') return d;
  return null;
}

/** The .ics Donald pastes into Airbnb / Booking.com: Roomboard bookings, merged, no names. */
export function unitIcs(db: DB, roomId: string, now?: Date): string {
  const r = db.rooms.find(x => x.id === roomId)!;
  const p = db.properties.find(x => x.id === r.propertyId)!;
  const today = londonToday();
  // an open-ended stay (until further notice) blocks a rolling year from today, refreshed on every read
  const ranges = mergeRanges(
    live(db, roomId).map(s => ({
      from: s.arrival,
      to: s.departure ?? addDays(s.arrival > today ? s.arrival : today, 365),
    })),
  ).map(x => ({ ...x, id: `${roomId}-${x.from}` }));
  return exportICS({ name: `${p.name} · Roomboard`, host: 'roomboard.pages.dev', ranges, now });
}

/** Bookings that a calendar block now overlaps (someone booked elsewhere after we booked). */
export function blockClashes(db: DB): { block: Block; stay: Stay }[] {
  const out: { block: Block; stay: Stay }[] = [];
  for (const b of db.blocks ?? [])
    for (const s of live(db, b.roomId))
      if (overlaps(s.arrival, s.departure, b.from, b.to)) out.push({ block: b, stay: s });
  return out;
}

export interface Segment {
  from: string;
  to: string | null; // null = open-ended
  kind: 'stay' | 'taken' | 'elsewhere';
  stay?: Stay; // only for bookings this person may see in full
}
/**
 * What one extra unit looks like between `from` and `to` for this person, for the board and the Rooms view.
 * Donald sees every booking, plus dates booked on other sites. Sheena sees her own bookings; everything else
 * (Donald's guests, other sites) is just "taken", with no name and no site.
 */
export function segments(
  db: DB,
  roomId: string,
  from: string,
  to: string,
  me: { id: string; role: string },
): Segment[] {
  const client = me.role !== 'manager';
  const out: Segment[] = [];
  for (const s of live(db, roomId)) {
    if (!overlaps(s.arrival, s.departure, from, to)) continue;
    const full = !client || (me.role === 'client' && s.bookedBy === me.id);
    out.push({ from: s.arrival, to: s.departure, kind: full ? 'stay' : 'taken', ...(full ? { stay: s } : {}) });
  }
  for (const b of db.blocks ?? []) {
    if (b.roomId !== roomId || !overlaps(b.from, b.to, from, to)) continue;
    out.push({ from: b.from, to: b.to, kind: client || b.feedId === 'taken' ? 'taken' : 'elsewhere' });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** Sheena's own booking on this night, if any (shown as "Yours"; Donald's other guests stay just "taken"). */
export const ownOn = (db: DB, roomId: string, d: string, userId: string) =>
  live(db, roomId).find(s => s.bookedBy === userId && overlaps(s.arrival, s.departure, d, addDays(d, 1)));

/** A prefilled booking from a tapped day: that night to the longest free run, up to `nights` (default a week). */
export function prefill(db: DB, roomId: string, d: string, nights = 7): { from: string; to: string } | null {
  if (!rangeFree(db, roomId, d, addDays(d, 1))) return null;
  let to = addDays(d, 1);
  while (diffDays(d, to) < nights && rangeFree(db, roomId, to, addDays(to, 1))) to = addDays(to, 1);
  return { from: d, to };
}

/** Open-ended from `from`: every night onward must be free. The first night that is not, or null when it can be. */
export function openBlocker(db: DB, roomId: string, from: string): string | null {
  let first: string | null = null;
  const take = (d: string) => (first = first && first < d ? first : d);
  for (const s of live(db, roomId)) if ((s.departure ?? '9999') > from) take(s.arrival > from ? s.arrival : from);
  for (const b of db.blocks ?? []) if (b.roomId === roomId && b.to > from) take(b.from > from ? b.from : from);
  return first;
}

/** Find a room: every extra property in board order, each one whole unit, free only if the entire stay is free
 *  (bookings, calendar "Taken" blocks and open-ended stays all count). `to` null = open-ended. No names, ever. */
export function extrasFor(db: DB, from: string, to: string | null) {
  return extraProps(db).flatMap(p => {
    const r = unitOf(db, p.id);
    if (!r) return [];
    const free = to ? to > from && rangeFree(db, r.id, from, to) : openBlocker(db, r.id, from) === null;
    return [{ p, room: r, free }];
  });
}
