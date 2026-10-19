// Regression (18 Oct 2026, Eshcol on the preview): setting a leaving date on an open-ended stay did nothing,
// because the stay kept its open status ('ufn') and the save dropped the date. One rule now, both backends.
import { describe, expect, it, vi } from 'vitest';
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
};
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
const { localRepo: repo } = await import('./local');
const { S, normDep, validate } = await import('./core');
const { toRow } = await import('./supabase');
const { checkBatch, toInput } = await import('../simple/logic');
const { addDays, londonToday } = await import('../dates');
const T = londonToday();
const openStay = () => S.db.stays.find(s => s.roomId === 'es-1' && s.depStatus === 'ufn' && !s.departure)!;

describe('setting the end date of an open-ended stay', () => {
  it('normDep: a date with an open status becomes a planned departure; an open status has no date', () => {
    expect(normDep({ departure: '2026-11-01', depStatus: 'ufn' as const })).toEqual({
      departure: '2026-11-01',
      depStatus: 'planned',
    });
    expect(normDep({ departure: '2026-11-01', depStatus: 'tbc' as const }).depStatus).toBe('planned');
    expect(normDep({ departure: null, depStatus: 'ufn' as const })).toEqual({ departure: null, depStatus: 'ufn' });
    expect(normDep({ departure: '2026-11-01', depStatus: 'confirmed' as const }).depStatus).toBe('confirmed');
  });

  it('demo store, single save: the date sticks and the nights after it free up', async () => {
    await repo.reset();
    const s = openStay(); // Alasdair Matheson, Eshcol Room 1, until further notice
    const end = addDays(T, 5);
    expect(validate({ ...toInput(s), roomId: 'es-1', departure: null, depStatus: 'ufn' })).toBeNull();
    await repo.saveStay({ ...toInput(s), departure: end }); // status still 'ufn', as the old Quick card sent it
    const after = S.db.stays.find(x => x.id === s.id)!;
    expect([after.departure, after.depStatus]).toEqual([end, 'planned']);
    // a new booking from the end date on is now allowed in the same room
    await repo.saveStay({
      roomId: 'es-1',
      workerId: null,
      holdLabel: 'Next',
      arrival: end,
      departure: addDays(end, 3),
      depStatus: 'planned',
      away: null,
      notes: '',
    });
    expect(S.db.stays.filter(x => x.roomId === 'es-1' && x.arrival === end).length).toBe(1);
  });

  it('demo store, batch save (Quick card): the date sticks, and the clash check counts it', async () => {
    await repo.reset();
    const s = openStay();
    const end = addDays(T, 4);
    // a later hold in the same room (as if made after the end date was agreed): with the old rule the end date was
    // ignored, so this looked like a clash with an open-ended stay
    S.db.stays.push({
      ...s,
      id: 'later-hold',
      workerId: null,
      holdLabel: 'Later',
      arrival: addDays(T, 10),
      departure: addDays(T, 12),
      depStatus: 'planned',
    });
    const inp = { ...toInput(s), departure: end };
    expect(checkBatch(S.db, [inp], [s.id])).toEqual([]);
    await repo.saveBatch([inp], [], 'end date');
    expect(S.db.stays.find(x => x.id === s.id)!.departure).toBe(end);
  });

  it('make it open-ended again, change the start, move room: the open status is kept', async () => {
    await repo.reset();
    const s = openStay();
    await repo.saveStay({ ...toInput(s), arrival: addDays(s.arrival, 1) });
    let cur = S.db.stays.find(x => x.id === s.id)!;
    expect([cur.departure, cur.depStatus]).toEqual([null, 'ufn']);
    await repo.saveStay({ ...toInput(cur), departure: addDays(T, 6), depStatus: 'planned' });
    await repo.saveStay({ ...toInput(S.db.stays.find(x => x.id === s.id)!), departure: null, depStatus: 'ufn' });
    cur = S.db.stays.find(x => x.id === s.id)!;
    expect([cur.departure, cur.depStatus]).toEqual([null, 'ufn']);
  });

  it('database path: the row sent to Supabase carries the date as planned (the table requires open = no date)', () => {
    const base = { roomId: 'es-1', workerId: 'w-16', holdLabel: '', arrival: '2026-09-28', away: null, notes: '' };
    expect(toRow({ ...base, departure: '2026-10-23', depStatus: 'ufn' })).toMatchObject({
      departure: '2026-10-23',
      dep_status: 'planned',
    });
    expect(toRow({ ...base, departure: null, depStatus: 'ufn' })).toMatchObject({ departure: null, dep_status: 'ufn' });
    expect(toRow({ ...base, departure: '2026-10-23', depStatus: 'tbc' })).toMatchObject({ dep_status: 'planned' });
  });
});
