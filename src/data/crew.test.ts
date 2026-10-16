// Crew booking with rotations, on the demo store (same validate()/reconcile() as single bookings).
import { beforeEach, describe, expect, it } from 'vitest';
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
};
const { localRepo: repo } = await import('./local');
const { S } = await import('./core');
const { planCrew, planInputs, usualRoom } = await import('./crew');
const { addDays, londonToday } = await import('../dates');
type Pattern = import('./rotation').Pattern;

const T = londonToday();
const start = addDays(T, 60);
const pat = (over: Partial<Pattern> = {}): Pattern => ({
  start,
  on: 10,
  off: 4,
  end: { kind: 'cycles', n: 3 },
  offMode: 'keep',
  ...over,
});
const base = (p: Pattern, n: number) => ({
  label: 'Crew A',
  propertyId: 'p-es',
  ...p,
  slots: Array.from({ length: n }, (_, i) => ({ slot: i, workerId: null, label: `Name TBC ${i + 1}` })),
});
async function book(p = pat(), holds = 3) {
  const plan = planCrew(S.db, { propertyId: 'p-es', roomIds: [], workerIds: [], holds, pattern: p });
  return repo.createSeries(base(p, holds), planInputs(plan, '', 'crew'));
}
const mine = (id: string) => S.db.stays.filter(s => s.seriesId === id);
const cleans = (id: string) => S.db.changeovers.filter(c => mine(id).some(s => s.id === c.fromStayId));

beforeEach(async () => {
  await repo.reset();
  await repo.setUser('u-client');
});

describe('crew planning', () => {
  it('gives each person a different free room and flags nothing', () => {
    const plan = planCrew(S.db, { propertyId: 'p-es', roomIds: [], workerIds: [], holds: 3, pattern: pat() });
    expect(plan.problems).toBe(0);
    expect(new Set(plan.slots.map(s => s.roomId)).size).toBe(3);
    expect(plan.slots.every(s => s.occ.length === 3)).toBe(true);
  });
  it("prefers a worker's usual room", () => {
    const w = S.db.workers.find(x => usualRoom(S.db, x.id)?.startsWith('es-'))!;
    const room = usualRoom(S.db, w.id)!;
    const late = pat({ start: addDays(T, 200) });
    const plan = planCrew(S.db, { propertyId: 'p-es', roomIds: [], workerIds: [w.id], holds: 2, pattern: late });
    expect(plan.slots[0].roomId).toBe(room);
    expect(plan.slots[0].usual).toBe(true);
  });
  it('flags a clash before anything is saved when there are not enough rooms', () => {
    const free = planCrew(S.db, { propertyId: 'p-es', roomIds: [], workerIds: [], holds: 1, pattern: pat() }).slots[0]
      .roomId!;
    const plan = planCrew(S.db, { propertyId: 'p-es', roomIds: [free], workerIds: [], holds: 2, pattern: pat() });
    expect(plan.problems).toBeGreaterThan(0);
    expect(plan.slots[1].occ[0].problem).toMatch(/Also given to Name TBC 1/);
  });
});

describe('crew booking', () => {
  it('keep mode: one stay per cycle, joined back to back, away on off days, one clean per room at the end', async () => {
    const s = await book();
    expect(mine(s.id)).toHaveLength(9);
    expect(mine(s.id).filter(x => x.away)).toHaveLength(6);
    expect(cleans(s.id)).toHaveLength(3);
    expect(S.db.activity.map(a => a.text).join('\n')).toMatch(/Crew booked: Crew A · 3 people · 10 on \/ 4 off/);
  });
  it('release mode: every on block ends in a changeover', async () => {
    const s = await book(pat({ offMode: 'release' }));
    expect(mine(s.id).every(x => !x.away)).toBe(true);
    expect(cleans(s.id)).toHaveLength(9);
  });
  it('is all or nothing when a stay clashes', async () => {
    const n = S.db.stays.length;
    const free = planCrew(S.db, { propertyId: 'p-es', roomIds: [], workerIds: [], holds: 1, pattern: pat() }).slots[0]
      .roomId!;
    const plan = planCrew(S.db, { propertyId: 'p-es', roomIds: [free], workerIds: [], holds: 2, pattern: pat() });
    await expect(repo.createSeries(base(pat(), 2), planInputs(plan, '', ''))).rejects.toThrow(/taken by/);
    expect(S.db.stays.length).toBe(n);
    expect(S.db.series ?? []).toHaveLength(0);
  });
  it('undo removes the whole booking in one step', async () => {
    const s = await book();
    await repo.undo();
    expect(mine(s.id)).toHaveLength(0);
    expect(S.db.series ?? []).toHaveLength(0);
  });
  it('extend adds cycles and turns the old last stay into a full cycle', async () => {
    const s = await book();
    await repo.updateSeries({ ...s, end: { kind: 'cycles', n: 4 } }, 'extended');
    expect(mine(s.id)).toHaveLength(12);
    expect(mine(s.id).filter(x => x.away)).toHaveLength(9);
    expect(cleans(s.id)).toHaveLength(3);
  });
  it('shorten to an end date drops later cycles', async () => {
    const s = await book();
    await repo.updateSeries({ ...s, end: { kind: 'date', date: addDays(start, 14) } }, 'shortened');
    expect(mine(s.id)).toHaveLength(3);
    expect(mine(s.id).every(x => !x.away && x.departure === addDays(start, 10))).toBe(true);
  });
  it('a single occurrence can be changed on its own and is kept when the series is reshaped', async () => {
    const s = await book();
    const one = mine(s.id).sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
    await repo.saveStay({ ...one, notes: 'Late arrival', away: null, departure: addDays(one.arrival, 14) });
    expect(S.db.stays.find(x => x.id === one.id)!.seriesId).toBe(s.id);
    await repo.updateSeries({ ...s, end: { kind: 'cycles', n: 4 } }, 'extended');
    expect(S.db.stays.find(x => x.id === one.id)!.notes).toBe('Late arrival');
  });
  it('naming a hold keeps the room continuing across cycles', async () => {
    const s = await book();
    const first = mine(s.id)
      .filter(x => x.slot === 0)
      .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
    await repo.saveStay({ ...first, workerId: 'w-1' });
    expect(cleans(s.id)).toHaveLength(3);
  });
});
