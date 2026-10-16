// Crew rotations: pure generator for "N on / M off" patterns. Mirrored by rb_rotation() in
// supabase/migrations/0007_crew_series.sql and tested against rules/cases.json ("rotation").
import { addDays } from '../dates';

export type OffMode = 'keep' | 'release';
export type RotationEnd = { kind: 'date'; date: string } | { kind: 'ufn' } | { kind: 'cycles'; n: number };
export interface Pattern {
  start: string;
  on: number;
  off: number;
  end: RotationEnd;
  offMode: OffMode;
  horizon?: string | null; // until-further-notice: generate up to here (default start + UFN_WEEKS)
}
export interface Occurrence {
  arrival: string;
  departure: string;
  away: { from: string; to: string } | null;
}

/** "Until further notice" generates this far ahead; Extend adds more later. */
export const UFN_WEEKS = 12;
export const MAX_CYCLES = 60;

/**
 * Keep mode ("Away, room kept"): one stay per cycle covering the on AND off days, with the off days marked
 * away, so cycles join back to back (same slot = continues = no clean). The last stay ends after its on block.
 * Release mode: one stay per on block; the room is free on off days, so every block ends in a changeover.
 */
export function occurrences(p: Pattern): Occurrence[] {
  if (!p.start || !(p.on >= 1) || !(p.off >= 0)) return [];
  const cycle = p.on + p.off;
  const stop =
    p.end.kind === 'date' ? p.end.date : p.end.kind === 'ufn' ? (p.horizon ?? addDays(p.start, UFN_WEEKS * 7)) : null;
  const maxN = p.end.kind === 'cycles' ? Math.min(p.end.n, MAX_CYCLES) : MAX_CYCLES;
  const out: Occurrence[] = [];
  for (let k = 0; k < maxN; k++) {
    const arrival = addDays(p.start, k * cycle);
    if (stop && arrival >= stop) break;
    const nextArr = addDays(arrival, cycle);
    const last = k + 1 >= maxN || (stop !== null && nextArr >= stop);
    let blockEnd = addDays(arrival, p.on);
    if (p.end.kind === 'date' && blockEnd > p.end.date) blockEnd = p.end.date;
    if (p.offMode === 'keep' && !last && p.off > 0)
      out.push({ arrival, departure: nextArr, away: { from: blockEnd, to: nextArr } });
    else out.push({ arrival, departure: blockEnd, away: null });
  }
  return out;
}

export const patternText = (p: Pick<Pattern, 'on' | 'off'>) => `${p.on} on / ${p.off} off`;
