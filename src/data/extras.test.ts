// Extra properties in the demo store: client requests, provider confirms/declines, calendar blocks, export, privacy.
import { describe, expect, it } from 'vitest';
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => mem.set(k, v),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
};
const { localRepo: repo } = await import('./local');
const { S, occupancy } = await import('./core');
const { addDays, londonToday } = await import('../dates');
const { dayState, rangeFree, unitIcs, nextFree, pendingRequests } = await import('./extras');
const { parseICS } = await import('./ical');
const T = londonToday();
const ask = (roomId: string, a: number, d: number, holdLabel = 'Name to follow') => ({
  roomId,
  workerId: null,
  holdLabel,
  arrival: addDays(T, a),
  departure: addDays(T, d),
  depStatus: 'planned' as const,
  away: null,
  notes: '',
});
const as = (role: 'client' | 'manager') => repo.setUser(S.db.users.find(u => u.role === role)!.id);
const freeSpan = (roomId: string, n: number) => {
  // first run of n free nights at least 2 days out
  for (let a = 2; a < 300; a++) if (rangeFree(S.db, roomId, addDays(T, a), addDays(T, a + n))) return a;
  throw new Error('no free span');
};

describe('extra properties (demo)', () => {
  it('seeds 5 bookable extra units with sample calendar blocks, outside the contract counts', async () => {
    await repo.reset();
    const extras = S.db.properties.filter(p => !p.contracted);
    expect(extras.map(p => p.id)).toEqual(['p-pod1', 'p-pod2', 'p-cottage', 'p-monadh']);
    expect(extras.every(p => S.db.rooms.filter(r => r.propertyId === p.id).length === 1)).toBe(true);
    expect(S.db.feeds!.every(f => f.simulated)).toBe(true);
    // the cottage's one-event-per-night sample is merged into stays of nights
    const cot = S.db.blocks!.filter(b => b.roomId === 'x-cottage');
    expect(cot.map(b => [b.from, b.to])).toEqual([
      [addDays(T, 5), addDays(T, 9)],
      [addDays(T, 25), addDays(T, 32)],
    ]);
    expect(dayState(S.db, 'x-pod1', addDays(T, 3))).toBe('elsewhere');
    expect(dayState(S.db, 'x-pod1', addDays(T, 7))).toBe('free'); // DTEND exclusive: check-out day is free
  });

  it('a client booking of an extra is a request; Donald is alerted; contract occupancy is unchanged', async () => {
    await repo.reset();
    await as('client');
    const before = occupancy(T).allocated;
    const a = freeSpan('x-pod1', 4);
    const s = await repo.saveStay({ ...ask('x-pod1', a, a + 4), request: null });
    expect(s.request).toBe('pending');
    expect(pendingRequests(S.db).map(x => x.id)).toEqual([s.id]);
    const al = S.db.alerts.filter(x => x.subject.startsWith('New request'));
    expect(al.length).toBeGreaterThan(0);
    expect(al.every(x => S.db.users.find(u => u.id === x.toUserId)!.role === 'manager')).toBe(true);
    expect(al[0].body).toMatch(/invoiced separately/);
    expect(occupancy(T).allocated).toBe(before);
    expect(dayState(S.db, 'x-pod1', addDays(T, a))).toBe('request');
    // the client cannot confirm her own request
    await expect(repo.confirmRequest(s.id)).rejects.toThrow(/Only Donald/);
  });

  it('clash rules: dates booked elsewhere and a waiting request both refuse a new request', async () => {
    await repo.reset();
    await as('client');
    await expect(repo.saveStay(ask('x-pod1', 2, 5))).rejects.toThrow(/booked elsewhere/); // sample block d3–d7
    const a = freeSpan('x-pod2', 3);
    await repo.saveStay(ask('x-pod2', a, a + 3));
    await expect(repo.saveStay(ask('x-pod2', a + 1, a + 2))).rejects.toThrow(/request waiting/);
  });

  it('Donald confirms: no longer a request, Sheena is alerted, it shows in the export feed, one undo', async () => {
    await repo.reset();
    await as('client');
    const a = freeSpan('x-monadh', 3);
    const s = await repo.saveStay(ask('x-monadh', a, a + 3));
    expect(unitIcs(S.db, 'x-monadh')).not.toContain('VEVENT'); // requests are not exported
    await as('manager');
    await repo.confirmRequest(s.id);
    const now = S.db.stays.find(x => x.id === s.id)!;
    expect(now.request).toBeNull();
    expect(dayState(S.db, 'x-monadh', addDays(T, a))).toBe('taken');
    const toClient = S.db.alerts.filter(x => x.subject.startsWith('Request confirmed'));
    expect(toClient.every(x => S.db.users.find(u => u.id === x.toUserId)!.role === 'client')).toBe(true);
    expect(toClient.length).toBeGreaterThan(0);
    const ics = unitIcs(S.db, 'x-monadh');
    expect(parseICS(ics)).toEqual([expect.objectContaining({ from: addDays(T, a), to: addDays(T, a + 3) })]);
    expect(ics).not.toMatch(/Name to follow|Sheena/);
    await repo.undo();
    expect(S.db.stays.find(x => x.id === s.id)!.request).toBe('pending');
  });

  it('Donald declines: the dates are free again and Sheena is told why', async () => {
    await repo.reset();
    await as('client');
    const a = freeSpan('x-monadh', 3);
    const s = await repo.saveStay(ask('x-monadh', a, a + 3));
    await as('manager');
    await repo.declineRequest(s.id, 'Lodge closed for maintenance');
    expect(S.db.stays.some(x => x.id === s.id)).toBe(false);
    expect(nextFree(S.db, 'x-monadh', addDays(T, a))).toBe(addDays(T, a));
    expect(S.db.alerts.find(x => x.subject.startsWith('Request declined'))!.body).toMatch(/maintenance/);
  });

  it('a confirmed extra cannot be changed or cancelled by the client', async () => {
    await repo.reset();
    await as('client');
    const a = freeSpan('x-cottage', 2);
    const s = await repo.saveStay(ask('x-cottage', a, a + 2));
    await as('manager');
    await repo.confirmRequest(s.id);
    await as('client');
    const cur = S.db.stays.find(x => x.id === s.id)!;
    await expect(repo.saveStay({ ...cur, away: null, departure: addDays(T, a + 3) })).rejects.toThrow(/Ask Donald/);
    await expect(repo.deleteStay(s.id)).rejects.toThrow(/Ask Donald/);
  });

  it('syncing flags a block that lands on a confirmed booking as a possible double booking', async () => {
    await repo.reset();
    await as('manager');
    const s = await repo.saveStay(ask('x-pod2', 40, 44)); // free in the sample feed
    expect((await repo.syncFeeds()).conflicts).toBe(0);
    // as if the d1–d9 booking were made on Booking.com after ours: not yet in our blocks when ours was saved
    S.db.blocks = S.db.blocks!.filter(b => b.roomId !== 'x-pod2');
    Object.assign(
      S.db.stays.find(x => x.id === s.id)!,
      { arrival: addDays(T, 2), departure: addDays(T, 4) },
    );
    expect((await repo.syncFeeds()).conflicts).toBe(1);
    expect(S.db.activity[0].text).toMatch(/^⚠ Uig is now booked elsewhere/);
  });

  it('calendar links: only Donald can add one; a bad link is refused; removing it removes its blocks', async () => {
    await repo.reset();
    await as('client');
    await expect(repo.addFeed({ roomId: 'x-pod1', label: 'Airbnb', url: 'https://x/a.ics' })).rejects.toThrow();
    await as('manager');
    await expect(repo.addFeed({ roomId: 'x-pod1', label: 'Airbnb', url: 'not a link' })).rejects.toThrow(/https/);
    await repo.addFeed({ roomId: 'x-pod1', label: 'Airbnb', url: 'https://www.airbnb.co.uk/calendar/ical/1.ics?s=x' });
    expect(S.db.feeds!.filter(f => f.roomId === 'x-pod1')).toHaveLength(2);
    await repo.removeFeed('f-x-pod1');
    expect(S.db.blocks!.some(b => b.roomId === 'x-pod1')).toBe(false);
  });

  it('upgrades an older demo store (v1) with the new details without losing stays', async () => {
    await repo.reset();
    const { upgrade } = await import('./local/store');
    const old = structuredClone(S.db);
    old.v = 1;
    old.properties = old.properties.map(p => ({ ...p, photos: undefined, checkout: '11:00' }));
    old.rooms = old.rooms.filter(r => !r.id.startsWith('x-'));
    delete old.feeds;
    delete old.blocks;
    const n = upgrade(old);
    expect(n.rooms.some(r => r.id === 'x-monadh')).toBe(true);
    expect(n.properties.find(p => p.id === 'p-es')!.photos!.length).toBeGreaterThan(3);
    expect(n.properties.find(p => p.id === 'p-es')!.checkout).toBe('11:00');
    expect(n.stays.length).toBe(S.db.stays.length);
    expect(n.blocks!.length).toBeGreaterThan(0);
  });
});
