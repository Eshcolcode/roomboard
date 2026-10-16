// Demo store commands, including the provider exception and undo.
import { beforeEach, describe, expect, it } from 'vitest';
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
};
const { localRepo: repo } = await import('./local');
const { S, readinessFor } = await import('./core');
const { addDays, londonToday } = await import('../dates');

const T = londonToday();
const room4 = () => S.db.changeovers.find(c => c.roomId === 'lr-4')!;
beforeEach(async () => {
  await repo.reset();
  await repo.setUser('u-donald');
});

describe('clean outside the window (Room 4: leaves +5, next arrival +6)', () => {
  it('is refused without an exception', async () => {
    await expect(
      repo.updateChangeover(room4().id, { status: 'scheduled', scheduledFor: addDays(T, 7) }),
    ).rejects.toThrow(/on or before the next arrival/);
    expect(room4().status).toBe('needs');
  });
  it('is allowed as a provider exception and stays flagged until ready', async () => {
    await repo.updateChangeover(room4().id, {
      status: 'scheduled',
      scheduledFor: addDays(T, 7),
      exception: 'Cleaner away',
    });
    expect(room4().exception).toBe('Cleaner away');
    expect(readinessFor(room4()).tone).toBe('warn');
    expect(readinessFor(room4()).provider).toMatch(/outside usual window/);
    expect(S.db.activity.slice(0, 3).some(a => /outside the usual window/.test(a.text))).toBe(true);
  });
  it('cannot be taken by the client as an exception', async () => {
    await repo.setUser('u-client');
    await expect(
      repo.updateChangeover(room4().id, { status: 'scheduled', scheduledFor: addDays(T, 7), exception: 'x' }),
    ).rejects.toThrow();
  });
  it('ready needs "guest has left"', async () => {
    const c8 = S.db.changeovers.find(c => c.roomId === 'lr-8')!;
    await expect(repo.updateChangeover(c8.id, { status: 'ready' })).rejects.toThrow(/Guest has left/);
    await repo.updateChangeover(c8.id, { vacated: true });
    await repo.updateChangeover(c8.id, { status: 'in_progress' });
    await repo.updateChangeover(c8.id, { status: 'ready' });
    expect(S.db.changeovers.find(c => c.id === c8.id)!.status).toBe('ready');
  });
});

describe('undo', () => {
  it('restores a cancelled stay with the same id and its booked clean', async () => {
    const s = S.db.stays.find(x => x.roomId === 'lr-8' && x.workerId)!;
    const before = S.db.changeovers.find(c => c.fromStayId === s.id)!;
    await repo.deleteStay(s.id);
    expect(S.db.stays.some(x => x.id === s.id)).toBe(false);
    await repo.undo();
    expect(S.db.stays.some(x => x.id === s.id)).toBe(true);
    const co = S.db.changeovers.find(c => c.id === before.id)!;
    expect(co.status).toBe('scheduled');
    expect(co.cancelled).toBeUndefined();
  });
  it('reverts an edit and bumps the version so other tabs see it', async () => {
    const s = S.db.stays.find(x => x.roomId === 'lr-6')!;
    const v = s.version;
    await repo.saveStay({ ...s, away: null, notes: 'changed' });
    await repo.undo();
    const now = S.db.stays.find(x => x.id === s.id)!;
    expect(now.notes).toBe('');
    expect(now.version).toBeGreaterThan(v + 1);
  });
});
