// Notification tiers, the RJ McLeod activity filter, and the red dot in the demo store (19 Oct 2026).
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
const { classify, classifyAll, diffStays, touchesWindow, visibleActivity, actorName } = await import('./notify');
const { priced } = await import('./pricing');
const T = londonToday();
const save = (x: object) => repo.saveStay(x as never);
const base = {
  id: 's1',
  roomId: 'lr-1',
  arrival: addDays(T, 2),
  departure: addDays(T, 9),
  depStatus: 'planned' as const,
  workerId: 'w-1',
  holdLabel: '',
  notes: '',
  away: null,
};
const as = (role: 'client' | 'manager' | 'cleaner') => repo.setUser(S.db.users.find(u => u.role === role)!.id);
const unread = (role: 'client' | 'manager' | 'cleaner') => {
  const u = S.db.users.find(x => x.role === role)!;
  return (S.db.notices ?? []).filter(n => n.forUserId === u.id && !n.read);
};

describe('classify: important vs minor', () => {
  it('new booking, cancellation and extras bookings are important', () => {
    expect(classify({ before: null, after: base })).toEqual({ tier: 'immediate', reasons: ['new booking'] });
    expect(classify({ before: null, after: base }, true).reasons).toEqual(['new extras booking']);
    expect(classify({ before: base, after: null }).tier).toBe('immediate');
  });
  it('arrival / leaving date changes, an end date set and a room move are important', () => {
    expect(classify({ before: base, after: { ...base, arrival: addDays(T, 3) } }).reasons).toEqual([
      'arrival date changed',
    ]);
    expect(classify({ before: base, after: { ...base, departure: addDays(T, 12) } }).reasons).toEqual([
      'leaving date changed',
    ]);
    const open = { ...base, departure: null, depStatus: 'ufn' as const };
    expect(classify({ before: open, after: base }).reasons).toEqual(['end date set']);
    expect(classify({ before: base, after: open }).reasons).toEqual(['leaving date changed']);
    expect(classify({ before: base, after: { ...base, roomId: 'lr-2' } }).tier).toBe('immediate');
  });
  it('name, notes, away dates, guest swap on the same dates and a confirmed departure are minor', () => {
    expect(classify({ before: base, after: { ...base, workerId: 'w-2' } })).toEqual({
      tier: 'minor',
      reasons: ['guest changed'],
    });
    const hold = { ...base, workerId: null, holdLabel: 'TBC' };
    expect(classify({ before: hold, after: { ...hold, holdLabel: 'Electrician' } }).tier).toBe('minor');
    expect(classify({ before: base, after: { ...base, notes: 'late key' } }).tier).toBe('minor');
    expect(classify({ before: base, after: { ...base, away: { from: addDays(T, 4), to: addDays(T, 6) } } }).tier).toBe(
      'minor',
    );
    expect(classify({ before: base, after: { ...base, depStatus: 'confirmed' as never } }).reasons).toEqual([
      'departure confirmed',
    ]);
  });
  it('several stays: important if any one is', () => {
    const b = [{ ...base, version: 1 }] as never[];
    const a = [
      { ...base, version: 2, notes: 'x' },
      { ...base, id: 's2', version: 1 },
    ] as never[];
    const d = diffStays(b, a);
    expect(d).toHaveLength(2);
    expect(classifyAll(d).tier).toBe('immediate');
    expect(classifyAll(d.slice(0, 1)).tier).toBe('minor');
  });
  it('housekeeper window: an arrival or departure in the next 7 days', () => {
    expect(touchesWindow({ before: base, after: { ...base, departure: addDays(T, 20) } }, T)).toBe(true); // arrival in 2 days
    const far = { ...base, arrival: addDays(T, 20), departure: addDays(T, 30) };
    expect(touchesWindow({ before: far, after: { ...far, departure: addDays(T, 31) } }, T)).toBe(false);
    const long = { ...base, arrival: addDays(T, -30), departure: addDays(T, 30) };
    expect(touchesWindow({ before: long, after: { ...long, departure: addDays(T, 3) } }, T)).toBe(true); // early end
  });
});

describe('demo store: red dot, outbox and the RJ McLeod activity log', () => {
  it('RJ McLeod changes a leaving date → Eshcol gets a red dot and a queued email; the housekeeper too (in 7 days)', async () => {
    await repo.reset();
    await as('client');
    const s = S.db.stays.find(x => x.roomId === 'lr-2' && x.departure === addDays(T, 7))!;
    const emails = S.db.alerts.length;
    await save({ ...s, departure: addDays(T, 6) });
    expect(unread('manager')).toHaveLength(1);
    expect(unread('manager')[0].reasons).toContain('leaving date changed');
    expect(unread('cleaner')).toHaveLength(1);
    expect(unread('client')).toHaveLength(0); // never the person who made the change
    expect(S.db.alerts.length).toBeGreaterThan(emails);
    expect(S.db.activity.find(a => a.kind === 'stay')!.tier).toBe('immediate');
  });
  it('a phone number, a name or a note change: log only, no red dot, no email', async () => {
    await repo.reset();
    await as('client');
    const emails = S.db.alerts.length;
    const w = S.db.workers[0];
    await repo.upsertWorker({ ...w, phone: '+44 7700 900999' });
    const s = S.db.stays.find(x => x.roomId === 'lr-1')!;
    await save({ ...s, notes: 'Late check-in' });
    await save({ ...S.db.stays.find(x => x.id === s.id)!, workerId: 'w-5' });
    expect(unread('manager')).toHaveLength(0);
    expect(unread('cleaner')).toHaveLength(0);
    expect(S.db.alerts.length).toBe(emails);
    expect(S.db.activity.find(a => a.kind === 'stay')!.tier).toBe('minor');
  });
  it('a change far ahead does not alert the housekeeper; switching housekeeper alerts off stops them', async () => {
    await repo.reset();
    await as('client');
    const s = S.db.stays.find(x => x.roomId === 'lr-9' && x.arrival === addDays(T, 12))!;
    await save({ ...s, departure: addDays(T, 27) });
    expect(unread('manager')).toHaveLength(1);
    expect(unread('cleaner')).toHaveLength(0);
    await as('manager');
    await repo.setSettings({ housekeeperAlerts: false });
    const n = S.db.stays.find(x => x.roomId === 'lr-2' && x.departure === addDays(T, 7))!;
    await save({ ...n, departure: addDays(T, 5) });
    expect(unread('cleaner')).toHaveLength(0);
    expect(unread('client')).toHaveLength(1); // Eshcol's change → RJ McLeod
  });
  it('marking read clears the dot', async () => {
    const ids = unread('client').map(n => n.id);
    await repo.markRead(ids);
    expect(unread('client')).toHaveLength(0);
  });
  it('RJ McLeod activity: no cleaning, rates, calendar sync or Eshcol-only entries; people shown by role', async () => {
    await repo.reset();
    await as('manager');
    await repo.setSettings({ ratePerRoomWeek: 360 });
    await repo.syncFeeds();
    await repo.updateChangeover(S.db.changeovers[0].id, { scheduledFor: addDays(T, 2) });
    const client = S.db.users.find(u => u.role === 'client')!;
    const seen = visibleActivity(S.db, client);
    expect(seen.length).toBeGreaterThan(0);
    for (const a of seen) {
      expect(['stay', 'rota', 'worker']).toContain(a.kind);
      expect(a.managerOnly).toBeFalsy();
      expect(a.text).not.toMatch(/£|rate|calendar|clean|Mairi/i);
    }
    expect(S.db.activity.some(a => a.kind === 'rate')).toBe(true);
    expect(S.db.activity.some(a => a.kind === 'cleaning')).toBe(true);
    const donald = S.db.users.find(u => u.role === 'manager')!;
    const mairi = S.db.users.find(u => u.role === 'cleaner')!;
    expect(actorName(S.db, donald.id, client)).toBe('Eshcol');
    expect(actorName(S.db, mairi.id, client)).toBe('Housekeeper');
    expect(actorName(S.db, mairi.id, donald)).toBe(mairi.name);
    expect(visibleActivity(S.db, mairi)).toEqual([]);
  });
  it('the housekeeper never sees a price', async () => {
    const harris = S.db.properties.find(p => !p.contracted)!;
    await as('manager');
    expect(priced(harris)).toBe(true);
    await as('cleaner');
    expect(priced(harris)).toBe(false);
  });
});
