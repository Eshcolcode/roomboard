// Extra properties (Harris and Uig pods, Abhainn Cottage, Monadh): availability per day, the iCal export of one unit,
// and clashes between calendar blocks and bookings. Pure helpers over a DB snapshot.
import { addDays, overlaps } from '../dates';
import type { Block, DB, Stay } from './core';
import { exportICS, mergeRanges } from './ical';

export type DayState = 'free' | 'taken' | 'request' | 'elsewhere';

export const extraProps = (db: DB) => db.properties.filter(p => !p.contracted);
export const unitOf = (db: DB, propertyId: string) => db.rooms.find(r => r.propertyId === propertyId);
const live = (db: DB, roomId: string) => db.stays.filter(s => s.roomId === roomId);

/** What a night looks like on one unit. Nobody's name is ever part of this. */
export function dayState(db: DB, roomId: string, d: string): DayState {
  const n = addDays(d, 1);
  const st = live(db, roomId).find(s => overlaps(s.arrival, s.departure, d, n));
  if (st) return st.request === 'pending' ? 'request' : 'taken';
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

/** The .ics Donald pastes into Airbnb / Booking.com: confirmed bookings only, merged, no names. */
export function unitIcs(db: DB, roomId: string, now?: Date): string {
  const r = db.rooms.find(x => x.id === roomId)!;
  const p = db.properties.find(x => x.id === r.propertyId)!;
  const ranges = mergeRanges(
    live(db, roomId)
      .filter(s => !s.request)
      .map(s => ({ from: s.arrival, to: s.departure ?? addDays(s.arrival, 365) })),
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
export const pendingRequests = (db: DB) =>
  db.stays.filter(s => s.request === 'pending').sort((a, b) => a.arrival.localeCompare(b.arrival));
