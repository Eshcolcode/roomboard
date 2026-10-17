// Simple mode (mockup): pure helpers over a DB snapshot, so they can be unit-tested without React or a store.
import { addDays, fmt, overlaps } from '../dates';
import { stayError } from '../data/rules';
import type { DB, Room, Stay, StayInput } from '../data/core';

export const roomNum = (r: Room) => parseInt(r.name.replace(/\D/g, ''), 10) || 0;
const dep = (s: { departure: string | null; depStatus: string }) =>
  s.depStatus === 'tbc' || s.depStatus === 'ufn' ? null : s.departure;

/** Contracted rooms with no stay overlapping [from, to), ignoring the given stay ids. Sorted by property then number. */
export function freeIn(db: DB, from: string, to: string | null, ignore: string[] = []): Room[] {
  const order = db.properties.filter(p => p.contracted).map(p => p.id);
  return db.rooms
    .filter(
      r =>
        order.includes(r.propertyId) &&
        !db.stays.some(s => !ignore.includes(s.id) && s.roomId === r.id && overlaps(s.arrival, s.departure, from, to)),
    )
    .sort((a, b) => order.indexOf(a.propertyId) - order.indexOf(b.propertyId) || roomNum(a) - roomNum(b));
}

/**
 * Rooms to suggest for a crew of n: one part of a building (e.g. the Eshcol flat) if it fits, otherwise one
 * property, otherwise fill from the property with the most free rooms. May return fewer than n.
 */
export function suggestBlock(
  db: DB,
  n: number,
  from: string,
  to: string | null,
  ignore: string[] = [],
  propertyId?: string,
): Room[] {
  const free = freeIn(db, from, to, ignore).filter(r => !propertyId || r.propertyId === propertyId);
  if (n <= 0) return [];
  const byUnit = new Map<string, Room[]>();
  free.forEach(r => byUnit.set(r.unitId, [...(byUnit.get(r.unitId) ?? []), r]));
  const unitFit = [...byUnit.values()].filter(l => l.length >= n).sort((a, b) => a.length - b.length)[0];
  if (unitFit) return unitFit.slice(0, n);
  const byProp = new Map<string, Room[]>();
  free.forEach(r => byProp.set(r.propertyId, [...(byProp.get(r.propertyId) ?? []), r]));
  const propFit = [...byProp.values()].filter(l => l.length >= n).sort((a, b) => a.length - b.length)[0];
  if (propFit) return propFit.slice(0, n);
  return [...byProp.values()]
    .sort((a, b) => b.length - a.length)
    .flat()
    .slice(0, n);
}

/** The free room closest to `roomId` (same part of the building, same property, nearest number). */
export function nearestFree(
  db: DB,
  roomId: string,
  from: string,
  to: string | null,
  ignore: string[] = [],
  exclude: string[] = [],
): Room | null {
  const me = db.rooms.find(r => r.id === roomId);
  if (!me) return null;
  const free = freeIn(db, from, to, ignore).filter(r => r.id !== roomId && !exclude.includes(r.id));
  const score = (r: Room) =>
    (r.unitId === me.unitId ? 0 : r.propertyId === me.propertyId ? 100 : 1000) + Math.abs(roomNum(r) - roomNum(me));
  return free.sort((a, b) => score(a) - score(b))[0] ?? null;
}

const who = (db: DB, s: Stay) => db.workers.find(w => w.id === s.workerId)?.name ?? 'a held place (name to follow)';
export const roomText = (db: DB, roomId: string) => {
  const r = db.rooms.find(x => x.id === roomId)!;
  return `${r.name} at ${db.properties.find(p => p.id === r.propertyId)!.short}`;
};

export interface Problem {
  index: number;
  text: string;
}
/**
 * Check a batch of stays (new or changed) together, in plain words. `ignore` are the ids being replaced.
 * Returns every problem so the screen can explain them before anything is saved.
 */
export function checkBatch(db: DB, inputs: StayInput[], ignore: string[] = []): Problem[] {
  const out: Problem[] = [];
  inputs.forEach((inp, index) => {
    const d = dep(inp);
    const shapeErr = stayError({ ...inp, departure: d }, []);
    if (shapeErr) {
      out.push({
        index,
        text:
          shapeErr === 'departure_not_after_arrival'
            ? 'The leaving date has to be after the arrival date.'
            : 'Those dates do not work. Please pick them again.',
      });
      return;
    }
    const clash = db.stays.find(
      s =>
        s.roomId === inp.roomId &&
        !ignore.includes(s.id) &&
        s.id !== inp.id &&
        overlaps(s.arrival, s.departure, inp.arrival, d),
    );
    if (clash) {
      out.push({
        index,
        text: `${roomText(db, inp.roomId)} is already booked for ${who(db, clash)} from ${fmt(clash.arrival)}${clash.departure ? ' to ' + fmt(clash.departure) : ' (no leaving date yet)'}.`,
      });
      return;
    }
    const twin = inputs.findIndex(
      (o, j) => j < index && o.roomId === inp.roomId && overlaps(o.arrival, dep(o), inp.arrival, d),
    );
    if (twin >= 0) out.push({ index, text: `${roomText(db, inp.roomId)} would be given to two people at once.` });
  });
  return out;
}

/** For each problem input, a free room for its dates (not used by the rest of the batch). */
export function fixByMoving(db: DB, inputs: StayInput[], problems: Problem[], ignore: string[] = []) {
  const used = inputs.filter((_, i) => !problems.some(p => p.index === i)).map(i => i.roomId);
  const fixed = inputs.map(i => ({ ...i }));
  for (const p of problems) {
    const inp = fixed[p.index];
    const alt = nearestFree(db, inp.roomId, inp.arrival, dep(inp), ignore, used);
    if (!alt) return null;
    used.push(alt.id);
    fixed[p.index] = { ...inp, roomId: alt.id };
  }
  return checkBatch(db, fixed, ignore).length ? null : fixed;
}

export const toInput = (s: Stay): StayInput => ({
  id: s.id,
  version: s.version,
  roomId: s.roomId,
  workerId: s.workerId,
  holdLabel: s.holdLabel,
  arrival: s.arrival,
  departure: s.departure,
  depStatus: s.depStatus,
  away: s.away ?? null,
  notes: s.notes,
  seriesId: s.seriesId ?? null,
  slot: s.slot ?? null,
});

/** Move a whole stay by n days (away dates move with it). */
export function shift(s: Stay, n: number): StayInput {
  const i = toInput(s);
  return {
    ...i,
    arrival: addDays(s.arrival, n),
    departure: s.departure ? addDays(s.departure, n) : null,
    away: s.away ? { from: addDays(s.away.from, n), to: addDays(s.away.to, n) } : null,
  };
}

/** New leaving date; away dates that would fall outside the stay are dropped. */
export function leaveOn(s: Stay, date: string | null): StayInput {
  const i = toInput(s);
  const away = s.away && date && s.away.to <= date ? s.away : null;
  return {
    ...i,
    departure: date,
    depStatus: date ? (s.depStatus === 'confirmed' ? 'confirmed' : 'planned') : 'tbc',
    away,
  };
}

/** The crew members who arrive together with this stay (same crew booking, same arrival). */
export function crewOf(db: DB, s: Stay): Stay[] {
  if (!s.seriesId) return [s];
  return db.stays
    .filter(x => x.seriesId === s.seriesId && x.arrival === s.arrival)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

/** Order saves so a batch never clashes with itself half-way (later dates first when moving later). */
export const saveOrder = (inputs: StayInput[], later: boolean) =>
  [...inputs].sort((a, b) => (later ? b.arrival.localeCompare(a.arrival) : a.arrival.localeCompare(b.arrival)));

/** Rows for the 7-day list: crews arriving or leaving together collapse into one row. */
export interface DayRow {
  key: string;
  kind: 'arrive' | 'leave';
  stays: Stay[];
}
export function dayRows(db: DB, date: string): DayRow[] {
  const contracted = new Set(db.properties.filter(p => p.contracted).map(p => p.id));
  const vis = db.stays.filter(s => contracted.has(db.rooms.find(r => r.id === s.roomId)?.propertyId ?? ''));
  const rows: DayRow[] = [];
  const add = (kind: DayRow['kind'], list: Stay[]) => {
    const groups = new Map<string, Stay[]>();
    for (const s of list) {
      const k = s.seriesId ? `${kind}:${s.seriesId}` : `${kind}:${s.id}`;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    groups.forEach((stays, key) => rows.push({ key, kind, stays }));
  };
  add(
    'arrive',
    vis.filter(s => s.arrival === date),
  );
  add(
    'leave',
    vis.filter(s => dep(s) === date),
  );
  return rows;
}

/**
 * Staying longer (or new dates) but the room is taken for the last part: keep the current room for as long as
 * it is free, then put just the remaining nights in the nearest free room (same part of the house first).
 * `exclude` are rooms that must not be used (e.g. the rest of the crew's rooms).
 */
export function splitPlan(db: DB, s: Stay, newDep: string, o: { arrival?: string; exclude?: string[] } = {}) {
  const arr = o.arrival ?? s.arrival;
  const oldDep = dep(s);
  if (!newDep || newDep <= arr) return null;
  if (!o.arrival && (!oldDep || newDep <= oldDep)) return null;
  const next = db.stays
    .filter(x => x.id !== s.id && x.roomId === s.roomId && overlaps(x.arrival, x.departure, arr, newDep))
    .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
  if (!next || next.arrival <= arr) return null;
  const cutoff = next.arrival;
  const room = nearestFree(db, s.roomId, cutoff, newDep, [s.id], o.exclude ?? []);
  if (!room) return null;
  const me = db.rooms.find(r => r.id === s.roomId)!;
  const keep: StayInput = {
    ...toInput(s),
    arrival: arr,
    departure: cutoff,
    depStatus: s.depStatus === 'confirmed' ? 'confirmed' : 'planned',
    away: s.away && s.away.from >= arr && s.away.to <= cutoff ? s.away : null,
  };
  const extra: StayInput = {
    roomId: room.id,
    workerId: s.workerId,
    holdLabel: s.holdLabel,
    arrival: cutoff,
    departure: newDep,
    depStatus: 'planned',
    away: null,
    notes: `Continues from ${roomText(db, s.roomId)}`,
    seriesId: s.seriesId ?? null,
    slot: s.slot ?? null,
  };
  return {
    keep,
    extra,
    room,
    cutoff,
    otherHouse: room.propertyId !== me.propertyId,
    nightsKept: oldDep ? Math.max(0, Math.round((Date.parse(cutoff) - Date.parse(oldDep)) / 864e5)) : 0,
  };
}

/**
 * The room is taken by the SAME person's next stay: offer to join the two into one stay (no clean in between).
 */
export function joinPlan(db: DB, s: Stay, newDep: string) {
  if (!s.workerId) return null;
  const oldDep = dep(s);
  const c = db.stays
    .filter(x => x.id !== s.id && x.roomId === s.roomId && overlaps(x.arrival, x.departure, s.arrival, newDep))
    .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
  if (!c || c.workerId !== s.workerId || (oldDep && c.arrival < oldDep)) return null;
  const cDep = dep(c);
  const until = cDep && cDep < newDep ? newDep : cDep;
  const input: StayInput = {
    ...toInput(s),
    departure: until,
    depStatus: until ? (c.depStatus === 'confirmed' && until === cDep ? 'confirmed' : 'planned') : c.depStatus,
    notes: [s.notes, c.notes].filter(Boolean).join('\n'),
  };
  return { input, removeId: c.id, next: c, until };
}

/** Every stay of this crew booking from this rotation on, grouped by place (slot). */
export function futureOf(db: DB, s: Stay): Stay[][] {
  if (!s.seriesId) return [[s]];
  const all = db.stays.filter(x => x.seriesId === s.seriesId && x.arrival >= s.arrival);
  const slots = [...new Set(all.map(x => x.slot ?? -1))].sort((a, b) => a - b);
  return slots.map(k => all.filter(x => (x.slot ?? -1) === k).sort((a, b) => a.arrival.localeCompare(b.arrival)));
}

/** One room per group (slot), free for every stay of that group, all in one property. Null if it cannot fit. */
export function assignRooms(db: DB, groups: Stay[][], propertyId: string): string[] | null {
  const ignore = groups.flat().map(x => x.id);
  const rooms = freeIn(db, '0000-01-01', '0000-01-02').filter(r => r.propertyId === propertyId);
  const taken: string[] = [];
  const out: string[] = [];
  for (const g of groups) {
    const r = rooms.find(
      r => !taken.includes(r.id) && g.every(x => freeIn(db, x.arrival, dep(x), ignore).some(f => f.id === r.id)),
    );
    if (!r) return null;
    taken.push(r.id);
    out.push(r.id);
  }
  return out;
}

/** Crew staying longer: keep each room while it is free; only people whose room is taken move for the rest. */
export function crewSplitPlan(db: DB, crew: Stay[], newDep: string) {
  const inputs = crew.map(s => leaveOn(s, newDep));
  const ids = crew.map(s => s.id);
  const probs = checkBatch(db, inputs, ids);
  if (!probs.length) return null;
  const exclude = crew.map(s => s.roomId);
  const out: StayInput[] = [];
  const moved: { name: string; room: string; cutoff: string }[] = [];
  for (let i = 0; i < crew.length; i++) {
    if (!probs.some(p => p.index === i)) {
      out.push(inputs[i]);
      continue;
    }
    const sp = splitPlan(db, crew[i], newDep, { exclude });
    if (!sp) return null;
    exclude.push(sp.room.id);
    out.push(sp.keep, sp.extra);
    moved.push({ name: who(db, crew[i]), room: sp.room.name, cutoff: sp.cutoff });
  }
  return checkBatch(db, out, ids).length ? null : { inputs: out, moved };
}
