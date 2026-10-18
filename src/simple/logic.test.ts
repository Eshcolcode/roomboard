// Simple mode helpers: free rooms, crew block suggestion, plain-language clash check, nearest free room.
import { describe, expect, it } from 'vitest';
import { seed } from '../data/local/seed';
import { addDays, londonToday } from '../dates';
import { checkBatch, crewOf, dayRows, fixByMoving, freeIn, nearestFree, shift, suggestBlock, toInput } from './logic';
import type { DB, Stay } from '../data/core';

const T = londonToday();
const far = addDays(T, 200); // the seed has nothing booked this far out
const mk = (db: DB, roomId: string, a: string, d: string | null, extra: Partial<Stay> = {}): Stay => {
  const s: Stay = {
    id: 'x' + db.stays.length,
    roomId,
    workerId: null,
    holdLabel: 'Name TBC',
    arrival: a,
    departure: d,
    depStatus: d ? 'planned' : 'tbc',
    notes: '',
    version: 1,
    updatedBy: 'u-donald',
    updatedAt: '',
    ...extra,
  };
  db.stays.push(s);
  return s;
};

describe('extra properties in the plain-language check', () => {
  it("never names Donald's own guest to Sheena, and counts dates booked on other sites", () => {
    const db = seed();
    db.currentUser = 'u-client';
    const w = db.workers[0];
    mk(db, 'x-pod1', far, addDays(far, 5), { workerId: w.id, holdLabel: '', bookedBy: 'u-donald' });
    const mine = mk(db, 'x-pod1', addDays(far, 10), addDays(far, 12), { bookedBy: 'u-client' });
    const p = checkBatch(db, [{ ...toInput(mine), arrival: addDays(far, 3) }], [mine.id]);
    expect(p).toHaveLength(1);
    expect(p[0].text).toContain('taken on some of those dates');
    expect(p[0].text).not.toContain(w.name);
    // Donald sees who it is
    db.currentUser = 'u-donald';
    expect(checkBatch(db, [{ ...toInput(mine), arrival: addDays(far, 3) }], [mine.id])[0].text).toContain(w.name);
    // a calendar block from another site
    db.blocks = [...(db.blocks ?? []), { roomId: 'x-pod1', from: addDays(far, 20), to: addDays(far, 24) } as never];
    const q = checkBatch(db, [{ ...toInput(mine), departure: addDays(far, 22) }], [mine.id]);
    expect(q).toHaveLength(1);
    expect(q[0].text).toMatch(/taken .* Choose other dates/);
  });
});

describe('simple mode logic', () => {
  it('lists only contracted rooms, and drops a room once it is booked', () => {
    const db = seed();
    const before = freeIn(db, far, addDays(far, 7));
    expect(before.length).toBeGreaterThan(12);
    expect(before.every(r => /^(lr|es)-/.test(r.id))).toBe(true);
    mk(db, before[0].id, far, addDays(far, 2));
    expect(freeIn(db, far, addDays(far, 7)).map(r => r.id)).not.toContain(before[0].id);
  });
  it('suggests a crew block inside one part of a building when it fits', () => {
    const db = seed();
    const r = suggestBlock(db, 3, far, addDays(far, 10));
    expect(r).toHaveLength(3);
    expect(new Set(r.map(x => x.unitId)).size).toBe(1);
  });
  it('fills across both houses for a crew of 12', () => {
    const db = seed();
    const r = suggestBlock(db, 12, far, addDays(far, 10));
    expect(r).toHaveLength(12);
    expect(new Set(r.map(x => x.id)).size).toBe(12);
  });
  it('explains a clash in plain words and offers the nearest free room', () => {
    const db = seed();
    mk(db, 'es-4', far, addDays(far, 5), { workerId: 'w-1', holdLabel: '' });
    const mine = mk(db, 'es-5', addDays(far, 10), addDays(far, 12));
    const moved = { ...toInput(mine), roomId: 'es-4', arrival: addDays(far, 2) };
    const p = checkBatch(db, [moved], [mine.id]);
    expect(p).toHaveLength(1);
    expect(p[0].text).toMatch(/Room 4 at Eshcol is already booked for Callum MacLeod/);
    const fixed = fixByMoving(db, [moved], p, [mine.id]);
    expect(fixed?.[0].roomId).not.toBe('es-4');
    expect(nearestFree(db, 'es-4', far, addDays(far, 5))?.propertyId).toBe('p-es');
  });
  it('stops two crew members being given the same room', () => {
    const db = seed();
    const a = mk(db, 'lr-1', far, addDays(far, 3), { seriesId: 's1', slot: 0 });
    const b = mk(db, 'lr-2', far, addDays(far, 3), { seriesId: 's1', slot: 1 });
    const p = checkBatch(db, [toInput(a), { ...toInput(b), roomId: 'lr-1' }], [a.id, b.id]);
    expect(p[0].text).toMatch(/two people/);
  });
  it('shifts a whole crew by days without clashing with itself', () => {
    const db = seed();
    const a = mk(db, 'lr-1', far, addDays(far, 3), { seriesId: 's1', slot: 0 });
    mk(db, 'lr-2', far, addDays(far, 3), { seriesId: 's1', slot: 1 });
    const crew = crewOf(db, a);
    expect(crew).toHaveLength(2);
    const inputs = crew.map(s => shift(s, 2));
    expect(inputs[0].arrival).toBe(addDays(far, 2));
    expect(
      checkBatch(
        db,
        inputs,
        crew.map(s => s.id),
      ),
    ).toEqual([]);
  });
  it('collapses a crew arriving together into one row', () => {
    const db = seed();
    mk(db, 'lr-1', far, addDays(far, 3), { seriesId: 's1', slot: 0 });
    mk(db, 'lr-2', far, addDays(far, 3), { seriesId: 's1', slot: 1 });
    const rows = dayRows(db, far);
    expect(rows.filter(r => r.kind === 'arrive')).toHaveLength(1);
    expect(rows[0].stays).toHaveLength(2);
  });
  it('rejects a leaving date before arrival', () => {
    const db = seed();
    const s = mk(db, 'lr-3', far, addDays(far, 3));
    expect(checkBatch(db, [{ ...toInput(s), departure: far }], [s.id])[0].text).toMatch(/after the arrival/);
  });
});

describe('split stay when staying longer', () => {
  it('keeps the current room up to the next booking and puts only the extra nights elsewhere', async () => {
    const { splitPlan } = await import('./logic');
    const db = seed();
    const me = mk(db, 'es-4', far, addDays(far, 5), { workerId: 'w-2', holdLabel: '' });
    mk(db, 'es-4', addDays(far, 7), addDays(far, 12), { workerId: 'w-1', holdLabel: '' });
    const p = splitPlan(db, me, addDays(far, 10))!;
    expect(p.keep.roomId).toBe('es-4');
    expect(p.keep.departure).toBe(addDays(far, 7)); // two more nights in the same room
    expect(p.extra.arrival).toBe(addDays(far, 7));
    expect(p.extra.departure).toBe(addDays(far, 10));
    expect(p.extra.roomId).not.toBe('es-4');
    expect(p.extra.workerId).toBe('w-2');
    expect(checkBatch(db, [p.keep, p.extra], [me.id])).toEqual([]);
  });
  it('offers nothing when the room is free for the whole extension', async () => {
    const { splitPlan } = await import('./logic');
    const db = seed();
    const me = mk(db, 'es-4', far, addDays(far, 5));
    expect(splitPlan(db, me, addDays(far, 9))).toBeNull();
  });
});

describe('join, split on new dates, future rotations', () => {
  it('joins two stays of the same person in the same room', async () => {
    const { joinPlan } = await import('./logic');
    const db = seed();
    const a = mk(db, 'lr-4', far, addDays(far, 4), { workerId: 'w-3', holdLabel: '' });
    const b = mk(db, 'lr-4', addDays(far, 6), addDays(far, 12), { workerId: 'w-3', holdLabel: '' });
    const j = joinPlan(db, a, addDays(far, 8))!;
    expect(j.removeId).toBe(b.id);
    expect(j.input.departure).toBe(addDays(far, 12));
    expect(checkBatch(db, [j.input], [a.id, b.id])).toEqual([]);
    const other = mk(db, 'lr-6', far, addDays(far, 4), { workerId: 'w-4', holdLabel: '' });
    mk(db, 'lr-6', addDays(far, 6), addDays(far, 9), { workerId: 'w-5', holdLabel: '' });
    expect(joinPlan(db, other, addDays(far, 8))).toBeNull(); // different person: no join
  });
  it('splits a change of dates and prefers the same house for the overflow nights', async () => {
    const { splitPlan } = await import('./logic');
    const db = seed();
    const s = mk(db, 'lr-9', far, addDays(far, 4));
    mk(db, 'lr-9', addDays(far, 8), addDays(far, 15));
    const p = splitPlan(db, s, addDays(far, 10), { arrival: addDays(far, 2) })!;
    expect(p.keep.arrival).toBe(addDays(far, 2));
    expect(p.keep.departure).toBe(addDays(far, 8));
    expect(p.room.propertyId).toBe('p-lr');
    expect(p.otherHouse).toBe(false);
  });
  it('groups future rotations by place and finds one room per place for all of them', async () => {
    const { futureOf, assignRooms } = await import('./logic');
    const db = seed();
    const a1 = mk(db, 'es-3', far, addDays(far, 10), { seriesId: 'S', slot: 0 });
    mk(db, 'es-3', addDays(far, 14), addDays(far, 24), { seriesId: 'S', slot: 0 });
    mk(db, 'es-4', far, addDays(far, 10), { seriesId: 'S', slot: 1 });
    mk(db, 'es-4', addDays(far, 14), addDays(far, 24), { seriesId: 'S', slot: 1 });
    const f = futureOf(db, a1);
    expect(f.map(g => g.length)).toEqual([2, 2]);
    const rooms = assignRooms(db, f, 'p-lr')!;
    expect(rooms).toHaveLength(2);
    expect(new Set(rooms).size).toBe(2);
  });
});

describe('crew staying longer', () => {
  it('keeps every room it can and moves only the blocked person for the extra nights', async () => {
    const { crewSplitPlan } = await import('./logic');
    const db = seed();
    const a = mk(db, 'es-8', far, addDays(far, 5), { seriesId: 'C', slot: 0 });
    const b = mk(db, 'es-9', far, addDays(far, 5), { seriesId: 'C', slot: 1 });
    mk(db, 'es-9', addDays(far, 7), addDays(far, 20), { workerId: 'w-1', holdLabel: '' });
    const p = crewSplitPlan(db, [a, b], addDays(far, 9))!;
    expect(p.moved).toHaveLength(1);
    expect(p.inputs).toHaveLength(3);
    const extra = p.inputs.find(i => !i.id)!;
    expect(extra.arrival).toBe(addDays(far, 7));
    expect(['es-8', 'es-9']).not.toContain(extra.roomId);
    expect(checkBatch(db, p.inputs, [a.id, b.id])).toEqual([]);
  });
});
