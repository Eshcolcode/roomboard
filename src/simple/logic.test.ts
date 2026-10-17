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
