// saveBatch: several stay changes as one command (all or nothing, one undo, one alert).
import { describe, expect, it } from 'vitest';
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
};
const { localRepo: repo } = await import('./local');
const { S } = await import('./core');
const { addDays, londonToday } = await import('../dates');
const far = addDays(londonToday(), 220);
const inp = (roomId: string, a: number, d: number) => ({
  roomId,
  workerId: null,
  holdLabel: 'Name TBC',
  arrival: addDays(far, a),
  departure: addDays(far, d),
  depStatus: 'planned' as const,
  away: null,
  notes: '',
});

describe('saveBatch (demo store)', () => {
  it('creates, updates and removes in one undo step with one alert', async () => {
    await repo.reset();
    await repo.saveStay(inp('lr-1', 0, 3));
    await repo.saveStay(inp('lr-2', 0, 3));
    const [a, b] = S.db.stays.filter(s => s.arrival === far);
    const n0 = S.db.stays.length;
    const alerts0 = S.db.alerts.length;
    await repo.saveBatch(
      [{ ...a, away: null, departure: addDays(far, 5) }, inp('lr-6', 0, 2)],
      [b.id],
      'Crew changed: test',
    );
    expect(S.db.stays.length).toBe(n0); // +1 created, -1 removed
    expect(S.db.stays.find(s => s.id === a.id)!.departure).toBe(addDays(far, 5));
    expect(S.db.alerts.length - alerts0).toBeLessThanOrEqual(1);
    await repo.undo();
    expect(S.db.stays.find(s => s.id === a.id)!.departure).toBe(addDays(far, 3));
    expect(S.db.stays.some(s => s.id === b.id)).toBe(true);
    expect(S.db.stays.length).toBe(n0);
  });
  it('is all or nothing: one clash and nothing changes', async () => {
    await repo.reset();
    await repo.saveStay(inp('lr-1', 0, 3));
    await repo.saveStay(inp('lr-2', 0, 3));
    const [a] = S.db.stays.filter(s => s.arrival === far && s.roomId === 'lr-1');
    const before = JSON.stringify(S.db.stays);
    await expect(
      repo.saveBatch([{ ...a, away: null, departure: addDays(far, 4) }, inp('lr-2', 1, 2)], [], 'should fail'),
    ).rejects.toThrow(/already taken/);
    expect(JSON.stringify(S.db.stays)).toBe(before);
  });
  it('refuses a stale edit', async () => {
    await repo.reset();
    await repo.saveStay(inp('lr-4', 0, 3));
    const a = S.db.stays.find(s => s.arrival === far && s.roomId === 'lr-4')!;
    await expect(repo.saveBatch([{ ...a, away: null, version: a.version - 1 }], [], 'stale')).rejects.toThrow(
      /changed/,
    );
  });
});
