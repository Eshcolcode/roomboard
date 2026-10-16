// Pure business rules: no React, no store. The same rules exist in SQL
// (supabase/migrations/0006_rule_functions.sql) and both are tested against rules/cases.json,
// so the demo and the live database cannot silently drift apart.
import { diffDays, overlaps } from '../dates';

export type DepStatusCode = 'planned' | 'confirmed' | 'tbc' | 'ufn';

/** Nights booked. Arrival day is a night, departure day is not. */
export const nights = (arrival: string, departure: string) => diffDays(arrival, departure);

export { overlaps };

export type Boundary = 'open' | 'continues' | 'zero_day' | 'changeover';

/** What happens to a room when a stay ends. */
export function boundary(
  dep: { workerId: string | null; departure: string | null; depStatus: DepStatusCode },
  next: { workerId: string | null; arrival: string } | null,
): Boundary {
  if (!dep.departure || dep.depStatus === 'tbc' || dep.depStatus === 'ufn') return 'open';
  if (next && next.arrival === dep.departure) {
    return next.workerId && next.workerId === dep.workerId ? 'continues' : 'zero_day';
  }
  return 'changeover';
}

export type WindowError = null | 'before_departure' | 'after_next_arrival';

/** A clean must happen on/after the departure and on/before the next arrival. */
export function cleanWindow(afterDate: string, readyBy: string | null, date: string): WindowError {
  if (date < afterDate) return 'before_departure';
  if (readyBy && date > readyBy) return 'after_next_arrival';
  return null;
}

export type GateError = null | 'before_departure' | 'needs_vacated';

/** Gate for status moves and the vacated tick. */
export function statusGate(
  target: 'vacated' | 'in_progress' | 'ready',
  vacated: boolean,
  today: string,
  afterDate: string,
): GateError {
  if (today < afterDate) return 'before_departure';
  if (target !== 'vacated' && !vacated) return 'needs_vacated';
  return null;
}

export type StayError =
  null | 'no_arrival' | 'no_departure' | 'away_order' | 'away_outside' | 'departure_not_after_arrival' | 'clash';

export interface StayShape {
  arrival: string;
  departure: string | null;
  depStatus: DepStatusCode;
  away?: { from: string; to: string } | null;
}

/** Stay validation. `others` are the other stays in the same room. */
export function stayError(s: StayShape, others: { arrival: string; departure: string | null }[] = []): StayError {
  if (!s.arrival) return 'no_arrival';
  const open = s.depStatus === 'tbc' || s.depStatus === 'ufn';
  const departure = open ? null : s.departure;
  if (!open && !departure) return 'no_departure';
  if (s.away) {
    if (!s.away.from || !s.away.to || s.away.to <= s.away.from) return 'away_order';
    if (s.away.from < s.arrival || (departure && s.away.to > departure)) return 'away_outside';
  }
  if (departure && departure <= s.arrival) return 'departure_not_after_arrival';
  if (others.some(o => overlaps(o.arrival, o.departure, s.arrival, departure))) return 'clash';
  return null;
}
