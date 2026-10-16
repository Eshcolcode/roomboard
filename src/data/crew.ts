// Crew booking: allocate rooms to a crew for a rotation pattern, and reshape a series later
// (extend, shorten, cancel). Pure functions over a DB snapshot; the repos apply the result atomically.
import { overlaps } from '../dates';
import { stayError } from './rules';
import { occurrences, type Occurrence, type Pattern } from './rotation';
import type { DB, Series, Stay, StayInput } from './core';

export interface CrewRequest {
  propertyId: string;
  roomIds: string[]; // empty = every room in the property
  workerIds: string[];
  holds: number; // unnamed "Name TBC" places
  pattern: Pattern;
  roomOverride?: Record<number, string>;
}
export interface PlannedOcc extends Occurrence {
  problem: string | null; // blocks confirm: room clash
  warn: string | null; // worker already booked elsewhere
}
export interface PlannedSlot {
  slot: number;
  workerId: string | null;
  label: string;
  roomId: string | null;
  usual: boolean;
  occ: PlannedOcc[];
}
export interface CrewPlan {
  slots: PlannedSlot[];
  occurrences: Occurrence[];
  problems: number;
  warnings: number;
}

const nameOf = (db: DB, s: Stay) => db.workers.find(w => w.id === s.workerId)?.name ?? s.holdLabel ?? 'Name to follow';
const shape = (o: Occurrence) => ({
  arrival: o.arrival,
  departure: o.departure,
  depStatus: 'planned' as const,
  away: o.away,
});

/** Usual room: the room of the worker's most recent stay. */
export function usualRoom(db: DB, workerId: string): string | undefined {
  return db.stays.filter(s => s.workerId === workerId).sort((a, b) => b.arrival.localeCompare(a.arrival))[0]?.roomId;
}

function clashIn(
  db: DB,
  roomId: string,
  o: Occurrence,
  planned: { roomId: string; o: Occurrence; label: string }[],
  ignore: Set<string>,
) {
  const others = db.stays.filter(s => s.roomId === roomId && !ignore.has(s.id));
  if (stayError(shape(o), others) === 'clash') {
    const c = others.find(s => overlaps(s.arrival, s.departure, o.arrival, o.departure))!;
    return `Taken by ${nameOf(db, c)}`;
  }
  const p = planned.find(x => x.roomId === roomId && overlaps(x.o.arrival, x.o.departure, o.arrival, o.departure));
  return p ? `Also given to ${p.label}` : null;
}

export function planCrew(db: DB, req: CrewRequest): CrewPlan {
  const occ = occurrences(req.pattern);
  const rooms = db.rooms
    .filter(r => r.propertyId === req.propertyId && (!req.roomIds.length || req.roomIds.includes(r.id)))
    .map(r => r.id);
  const people: { workerId: string | null; label: string }[] = [
    ...req.workerIds.map(id => ({ workerId: id, label: db.workers.find(w => w.id === id)?.name ?? 'Worker' })),
    ...Array.from({ length: Math.max(0, req.holds) }, (_, i) => ({ workerId: null, label: `Name TBC ${i + 1}` })),
  ];
  const planned: { roomId: string; o: Occurrence; label: string }[] = [];
  const none = new Set<string>();
  const freeAll = (roomId: string) => occ.every(o => !clashIn(db, roomId, o, planned, none));
  // people with a usual room in the chosen rooms go first so they keep it
  const order = people
    .map((p, slot) => ({ ...p, slot, usualId: p.workerId ? usualRoom(db, p.workerId) : undefined }))
    .sort(
      (a, b) => Number(!(a.usualId && rooms.includes(a.usualId))) - Number(!(b.usualId && rooms.includes(b.usualId))),
    );
  const slots: PlannedSlot[] = [];
  for (const p of order) {
    let roomId: string | null = req.roomOverride?.[p.slot] ?? null;
    if (!roomId && p.usualId && rooms.includes(p.usualId) && freeAll(p.usualId)) roomId = p.usualId;
    if (!roomId) roomId = rooms.find(freeAll) ?? null;
    if (!roomId && rooms.length) {
      // nothing free for every cycle: take the room with the fewest clashes and show them
      const score = (r: string) => occ.filter(o => clashIn(db, r, o, planned, none)).length;
      roomId = [...rooms].sort((a, b) => score(a) - score(b))[0];
    }
    const out: PlannedOcc[] = occ.map(o => {
      const problem = roomId ? clashIn(db, roomId, o, planned, none) : 'No room available';
      const other =
        p.workerId &&
        db.stays.find(
          s =>
            s.workerId === p.workerId &&
            s.roomId !== roomId &&
            overlaps(s.arrival, s.departure, o.arrival, o.departure),
        );
      return { ...o, problem, warn: other ? `Already booked in another room` : null };
    });
    if (roomId) occ.forEach(o => planned.push({ roomId: roomId!, o, label: p.label }));
    slots.push({
      slot: p.slot,
      workerId: p.workerId,
      label: p.label,
      roomId,
      usual: !!roomId && roomId === p.usualId,
      occ: out,
    });
  }
  slots.sort((a, b) => a.slot - b.slot);
  const all = slots.flatMap(s => s.occ);
  return {
    slots,
    occurrences: occ,
    problems: all.filter(o => o.problem).length,
    warnings: all.filter(o => o.warn).length,
  };
}

export function planInputs(plan: CrewPlan, seriesId: string, note: string): StayInput[] {
  return plan.slots.flatMap(s =>
    s.occ.map(o => ({
      roomId: s.roomId!,
      workerId: s.workerId,
      holdLabel: s.workerId ? '' : s.label,
      arrival: o.arrival,
      departure: o.departure,
      depStatus: 'planned' as const,
      away: o.away,
      notes: note,
      seriesId,
      slot: s.slot,
    })),
  );
}

export const seriesPattern = (s: Series): Pattern => ({
  start: s.start,
  on: s.on,
  off: s.off,
  end: s.end,
  offMode: s.offMode,
  horizon: s.horizon,
});

export interface Reshape {
  create: StayInput[];
  update: StayInput[];
  remove: string[];
}

/**
 * Bring a series' stays in line with a new end (extend / shorten / cancel from a date).
 * Occurrence k of each slot maps to the k-th stay of that slot. A stay whose arrival was changed by hand is
 * left alone unless it now falls after the end. Stays that already started are never removed, only shortened.
 */
export function reshape(db: DB, s: Series, next: Series, today: string): Reshape {
  const occ = occurrences(seriesPattern(next));
  const out: Reshape = { create: [], update: [], remove: [] };
  for (const sl of s.slots) {
    const mine = db.stays
      .filter(x => x.seriesId === s.id && x.slot === sl.slot)
      .sort((a, b) => a.arrival.localeCompare(b.arrival));
    const roomId = mine[mine.length - 1]?.roomId;
    mine.forEach((st, k) => {
      const o = occ[k];
      if (!o || (next.end.kind === 'date' && st.arrival >= next.end.date)) {
        if (st.arrival >= today) out.remove.push(st.id);
        else if (next.end.kind === 'date' && (st.departure ?? '9') > next.end.date)
          out.update.push({
            ...st,
            departure: next.end.date < st.arrival ? st.departure : maxD(today, next.end.date),
            away: clipAway(st.away ?? null, next.end.date),
          });
        return;
      }
      if (st.arrival !== o.arrival) return; // edited by hand: keep
      if (st.departure !== o.departure || JSON.stringify(st.away ?? null) !== JSON.stringify(o.away))
        out.update.push({ ...st, departure: o.departure, away: o.away });
    });
    if (!roomId) continue;
    for (let k = mine.length; k < occ.length; k++) {
      const o = occ[k];
      out.create.push({
        roomId,
        workerId: mine[mine.length - 1]?.workerId ?? sl.workerId,
        holdLabel: mine[mine.length - 1]?.holdLabel ?? sl.label,
        arrival: o.arrival,
        departure: o.departure,
        depStatus: 'planned',
        away: o.away,
        notes: mine[mine.length - 1]?.notes ?? '',
        seriesId: s.id,
        slot: sl.slot,
      });
    }
  }
  return out;
}
const maxD = (a: string, b: string) => (a > b ? a : b);
function clipAway(a: { from: string; to: string } | null, end: string) {
  if (!a || a.from >= end) return null;
  return { from: a.from, to: a.to > end ? end : a.to };
}
