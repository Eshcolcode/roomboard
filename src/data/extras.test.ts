// Extra properties in the demo store: direct booking (no request step), privacy, prices, calendar blocks, export.
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
const { dayState, rangeFree, unitIcs, segments, openBlocker, extrasFor } = await import('./extras');
const { estimateLine, priceLine, weekly } = await import('./pricing');
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
  it('seeds 4 bookable extra units; only Monadh has a linked calendar, outside the contract counts', async () => {
    await repo.reset();
    const extras = S.db.properties.filter(p => !p.contracted);
    expect(S.db.properties.map(p => p.short)).toEqual([
      'Eshcol',
      'Loch Roag',
      'Harris',
      'Uig',
      'Monadh',
      'Abhainn Cottage',
    ]);
    expect(extras.map(p => p.id)).toEqual(['p-pod1', 'p-pod2', 'p-monadh', 'p-cottage']);
    expect(extras.every(p => S.db.rooms.filter(r => r.propertyId === p.id).length === 1)).toBe(true);
    expect(S.db.feeds!.map(f => [f.roomId, f.linked])).toEqual([
      ['x-pod1', false],
      ['x-pod2', false],
      ['x-monadh', true],
      ['x-cottage', false],
    ]);
    expect(S.db.feeds!.every(f => !('url' in f))).toBe(true); // links are server secrets, never in the app
    // not linked yet: no blocks, no error
    expect(S.db.blocks!.filter(b => b.roomId !== 'x-monadh')).toEqual([]);
    expect(S.db.feeds!.every(f => !f.error)).toBe(true);
    const mo = S.db.blocks!.filter(b => b.roomId === 'x-monadh');
    expect(mo.length).toBeGreaterThan(0);
    expect(mo.every(b => b.to > T)).toBe(true);
    expect(dayState(S.db, 'x-monadh', mo[0].from > T ? mo[0].from : T)).toBe('elsewhere');
    const after = mo[0].to; // DTEND exclusive: check-out day is free unless another block starts that day
    if (!mo.some(b => b.from === after)) expect(dayState(S.db, 'x-monadh', after)).not.toBe('elsewhere');
  });

  it('demo Monadh calendar on 18 Oct 2026: booked 16–19 Nov, closed 20 Dec – 4 Jan', async () => {
    const { blocksFrom, SAMPLE_ICS } = await import('./local/feeds');
    const f = { id: 'f', roomId: 'x-monadh', label: 'SuperControl', linked: true };
    expect(blocksFrom(f, SAMPLE_ICS['x-monadh'], '2026-10-18').map(b => [b.from, b.to])).toEqual([
      ['2026-11-16', '2026-11-19'],
      ['2026-12-20', '2027-01-04'],
    ]);
    // once those have passed the sample moves on by whole 52-week steps, so the demo never goes empty
    const later = blocksFrom(f, SAMPLE_ICS['x-monadh'], '2027-03-01');
    expect(later.length).toBeGreaterThan(0);
    expect(later.every(b => b.to > '2027-03-01')).toBe(true);
  });

  it('Sheena books an extra straight away (no request): confirmed, Donald is alerted with the indicative price', async () => {
    await repo.reset();
    await as('client');
    const before = occupancy(T).allocated;
    const a = freeSpan('x-pod1', 4);
    const s = await repo.saveStay(ask('x-pod1', a, a + 4, 'Calum'));
    expect('request' in s).toBe(false);
    expect(s.bookedBy).toBe(S.db.currentUser);
    expect(dayState(S.db, 'x-pod1', addDays(T, a))).toBe('taken');
    const al = S.db.alerts.filter(x => x.subject.startsWith('New booking'));
    expect(al.length).toBeGreaterThan(0);
    expect(al.every(x => S.db.users.find(u => u.id === x.toUserId)!.role === 'manager')).toBe(true);
    // Harris: 1 bedroom × £350 = £350 a week; 4 nights pro rata = £200
    expect(al[0].body).toMatch(/whole property/);
    expect(al[0].body).toMatch(/Indicative £200 for 4 nights \(£350 a week ÷ 7 × 4\)/);
    expect(al[0].body).toMatch(/invoiced separately/);
    expect(occupancy(T).allocated).toBe(before); // extras never count against the contract
    // her booking is in the export feed straight away, with no names
    const ics = unitIcs(S.db, 'x-pod1');
    expect(parseICS(ics)).toEqual([expect.objectContaining({ from: addDays(T, a), to: addDays(T, a + 4) })]);
    expect(ics).not.toMatch(/Calum|Sheena/);
    // and she can change or cancel her own booking
    const cur = S.db.stays.find(x => x.id === s.id)!;
    await repo.saveStay({ ...cur, away: null, departure: addDays(T, a + 3) });
    await repo.deleteStay(s.id);
    expect(S.db.stays.some(x => x.id === s.id)).toBe(false);
  });

  it('double booking is still refused: dates booked elsewhere, or another booking, without naming anyone', async () => {
    await repo.reset();
    await as('client');
    const b = S.db.blocks!.find(x => x.roomId === 'x-monadh' && x.from > addDays(T, 1))!;
    await expect(
      repo.saveStay({ ...ask('x-monadh', 0, 1), arrival: b.from, departure: addDays(b.from, 1) }),
    ).rejects.toThrow(/booked elsewhere/);
    // Donald's direct guest in Abhainn Cottage (seeded): Sheena is told the dates are taken, not by whom
    const g = S.db.stays.find(x => x.roomId === 'x-cottage')!;
    const err = await repo
      .saveStay({ ...ask('x-cottage', 0, 1), arrival: g.arrival, departure: addDays(g.arrival, 2) })
      .catch((e: Error) => e.message);
    expect(err).toMatch(/taken on some of those dates/);
    expect(err).not.toMatch(/Direct guest/);
    const a = freeSpan('x-pod2', 3);
    await repo.saveStay(ask('x-pod2', a, a + 3));
    await expect(repo.saveStay(ask('x-pod2', a + 1, a + 2))).rejects.toThrow(/taken|Clash/i);
  });

  it("Donald's own extra bookings stay private: no alert to Sheena, not in her activity, dates only on her board", async () => {
    await repo.reset();
    await as('manager');
    const a = freeSpan('x-monadh', 3);
    const s = await repo.saveStay(ask('x-monadh', a, a + 3, 'Mrs Visitor'));
    expect(S.db.alerts.some(x => x.body.includes('Mrs Visitor'))).toBe(false);
    const act = S.db.activity.filter(x => x.text.includes('Mrs Visitor'));
    expect(act.length).toBeGreaterThan(0);
    expect(act.every(x => x.managerOnly)).toBe(true);
    const client = S.db.users.find(u => u.role === 'client')!;
    const forHer = segments(S.db, 'x-monadh', addDays(T, a), addDays(T, a + 3), client);
    expect(forHer.some(g => g.stay)).toBe(false);
    expect(forHer.some(g => g.kind === 'taken')).toBe(true);
    const forHim = segments(S.db, 'x-monadh', addDays(T, a), addDays(T, a + 3), {
      id: S.db.currentUser,
      role: 'manager',
    });
    expect(forHim.find(g => g.stay)!.stay!.id).toBe(s.id);
    // and Sheena cannot change or cancel it
    await as('client');
    await expect(repo.saveStay({ ...s, away: null, notes: 'x' })).rejects.toThrow(/made by Donald/);
    await expect(repo.deleteStay(s.id)).rejects.toThrow(/made by Donald|Ask him/);
  });

  it('calendar blocks: Donald sees "booked elsewhere", Sheena only "taken"', async () => {
    await repo.reset();
    const b = S.db.blocks!.find(x => x.roomId === 'x-monadh')!;
    const client = S.db.users.find(u => u.role === 'client')!;
    expect(segments(S.db, 'x-monadh', b.from, b.to, client).every(g => g.kind === 'taken')).toBe(true);
    expect(segments(S.db, 'x-monadh', b.from, b.to, { id: 'u-donald', role: 'manager' })[0].kind).toBe('elsewhere');
  });

  it('indicative prices: £350 per room per week; extras whole-property; only Donald changes the rate', async () => {
    await repo.reset();
    const P = (name: string) => S.db.properties.find(p => p.short === name)!;
    // block contract: no price at all
    expect(priceLine(S.db, P('Eshcol'))).toBeNull();
    expect(priceLine(S.db, P('Loch Roag'))).toBeNull();
    expect(S.db.properties.filter(p => p.contracted).map(p => p.short)).toEqual(['Eshcol', 'Loch Roag']);
    expect([P('Harris'), P('Uig'), P('Monadh'), P('Abhainn Cottage')].map(p => [p.bedrooms, weekly(S.db, p)])).toEqual([
      [1, 350],
      [1, 350],
      [2, 700],
      [3, 700], // Donald, 18 Oct 2026: Abhainn charged as 2 rooms (sofa-bed/desk room not charged)
    ]);
    expect(priceLine(S.db, P('Abhainn Cottage'))).toBe(
      'Indicative £350 per room per week · whole property, 2 rooms charged = £700 a week',
    );
    expect(priceLine(S.db, P('Monadh'))).toBe(
      'Indicative £350 per room per week · whole property, 2 rooms charged = £700 a week',
    );
    expect(estimateLine(S.db, P('Abhainn Cottage'), 3)).toBe('Indicative £300 for 3 nights (£700 a week ÷ 7 × 3)');
    await as('client');
    await expect(repo.setSettings({ ratePerRoomWeek: 1 })).rejects.toThrow(/Only Donald/);
    await as('manager');
    await expect(repo.setSettings({ ratePerRoomWeek: 0 })).rejects.toThrow(/weekly price/);
    await repo.setSettings({ ratePerRoomWeek: 420 });
    expect(priceLine(S.db, P('Harris'))).toMatch(/^Indicative £420 per room per week/);
    expect(priceLine(S.db, P('Eshcol'))).toBeNull();
    expect(weekly(S.db, P('Abhainn Cottage'))).toBe(840);
    expect(S.db.activity[0].managerOnly).toBe(true);
    // rate history: who, when, old and new
    await repo.setSettings({ ratePerRoomWeek: 380 });
    expect(S.db.rateHistory!.map(h => [h.from, h.to, h.userId])).toEqual([
      [420, 380, S.db.currentUser],
      [350, 420, S.db.currentUser],
    ]);
    expect(S.db.rateHistory!.every(h => !!h.ts)).toBe(true);
  });

  it('block contract: booking, changing or cancelling an Eshcol or Loch Roag room puts no £ in alerts or activity', async () => {
    await repo.reset();
    for (const role of ['client', 'manager'] as const) {
      await as(role);
      const roomId = role === 'client' ? 'es-9' : 'lr-9';
      let a = 2;
      while (
        S.db.stays.some(
          x => x.roomId === roomId && x.arrival < addDays(T, a + 3) && (x.departure ?? '9') > addDays(T, a),
        )
      )
        a++;
      const s = await repo.saveStay(ask(roomId, a, a + 3, 'Contract test'));
      await repo.saveStay({ ...S.db.stays.find(x => x.id === s.id)!, away: null, departure: addDays(T, a + 2) });
      await repo.deleteStay(s.id);
    }
    const about = (t: string) => /Eshcol|Loch Roag/.test(t);
    const alerts = S.db.alerts.map(x => x.subject + ' ' + x.body).filter(about);
    const acts = S.db.activity.map(x => x.text).filter(about);
    expect(alerts.length + acts.length).toBeGreaterThan(0);
    expect([...alerts, ...acts].filter(t => t.includes('£'))).toEqual([]);
  });

  it('syncing flags a block that lands on a confirmed booking as a possible double booking', async () => {
    await repo.reset();
    await as('manager');
    const b = S.db.blocks!.find(x => x.roomId === 'x-monadh')!;
    const a = freeSpan('x-monadh', 2);
    const s = await repo.saveStay(ask('x-monadh', a, a + 2));
    expect((await repo.syncFeeds()).conflicts).toBe(0);
    // as if that booking had been taken on SuperControl after ours was saved
    S.db.blocks = S.db.blocks!.filter(x => x.roomId !== 'x-monadh');
    Object.assign(
      S.db.stays.find(x => x.id === s.id)!,
      { arrival: b.from, departure: addDays(b.from, 1) },
    );
    expect((await repo.syncFeeds()).conflicts).toBe(1);
    expect(S.db.activity[0].text).toMatch(/^⚠ Monadh is now booked elsewhere/);
    expect(S.db.activity[0].text).not.toMatch(/SuperControl/);
    expect(S.db.activity[0].managerOnly).toBe(true); // Sheena never sees this
  });

  it('calendar not linked yet: reading calendars gives those units no blocks and no error', async () => {
    await repo.reset();
    await as('manager');
    await repo.syncFeeds();
    for (const id of ['x-pod1', 'x-pod2', 'x-cottage']) {
      const f = S.db.feeds!.find(x => x.roomId === id)!;
      expect([f.linked, f.error, f.lastSync]).toEqual([false, null, null]);
      expect(S.db.blocks!.some(x => x.roomId === id)).toBe(false);
      expect(dayState(S.db, id, addDays(T, 3))).not.toBe('elsewhere');
    }
    expect(S.db.feeds!.find(x => x.roomId === 'x-monadh')!.lastSync).toBeTruthy();
  });

  it('open-ended (until further notice): blocks every later night, weekly price, export a rolling year, end date later', async () => {
    await repo.reset();
    await as('client');
    // from the day after the last thing booked on Uig
    let a = 3;
    while (openBlocker(S.db, 'x-pod2', addDays(T, a))) a++;
    expect(openBlocker(S.db, 'x-pod2', addDays(T, a))).toBeNull();
    const s = await repo.saveStay({ ...ask('x-pod2', a, a + 1, 'Long stay'), departure: null, depStatus: 'ufn' });
    expect([s.departure, s.depStatus, s.bookedBy]).toEqual([null, 'ufn', S.db.currentUser]);
    for (const k of [0, 30, 200]) expect(dayState(S.db, 'x-pod2', addDays(T, a + k))).toBe('taken');
    expect(openBlocker(S.db, 'x-pod2', addDays(T, a))).toBe(addDays(T, a)); // now its own first night
    // nobody can book on top of it, however far out
    await as('manager');
    await expect(repo.saveStay(ask('x-pod2', a + 90, a + 92))).rejects.toThrow(/taken|Clash/i);
    // Donald is told it is open-ended, with the weekly price
    const al = S.db.alerts.find(x => x.subject.startsWith('New booking') && x.body.includes('until further notice'));
    expect(al?.body).toMatch(/Indicative £350 per week, until further notice/);
    expect(
      estimateLine(
        S.db,
        S.db.properties.find(p => p.id === 'p-pod2')!,
        null,
      ),
    ).toBe('Indicative £350 per week, until further notice');
    // the export blocks a rolling year ahead (other calendars cannot hold an "open" event)
    const ev = parseICS(unitIcs(S.db, 'x-pod2')).find(e => e.from === addDays(T, a))!;
    expect(ev.to).toBe(addDays(addDays(T, a), 365));
    expect(unitIcs(S.db, 'x-pod2')).not.toMatch(/Long stay/);
    // Sheena sets the end date later; the nights after it are free again
    await as('client');
    const cur = S.db.stays.find(x => x.id === s.id)!;
    await repo.saveStay({ ...cur, away: null, departure: addDays(T, a + 14), depStatus: 'planned' });
    expect(dayState(S.db, 'x-pod2', addDays(T, a + 13))).toBe('taken');
    expect(dayState(S.db, 'x-pod2', addDays(T, a + 14))).toBe('free');
    expect(parseICS(unitIcs(S.db, 'x-pod2')).find(e => e.from === addDays(T, a))!.to).toBe(addDays(T, a + 14));
  });

  it('open-ended is refused when any later night is taken, without saying by whom', async () => {
    await repo.reset();
    await as('client');
    const b = S.db.blocks!.filter(x => x.roomId === 'x-monadh' && x.from > addDays(T, 3))[0];
    // the first non-free night from day 2 is the first calendar block still to come
    const d2 = addDays(T, 2);
    const first = S.db.blocks!.find(x => x.roomId === 'x-monadh' && x.to > d2)!;
    expect(openBlocker(S.db, 'x-monadh', d2)).toBe(first.from > d2 ? first.from : d2);
    const err = await repo
      .saveStay({ ...ask('x-monadh', 2, 3), departure: null, depStatus: 'ufn' })
      .catch((e: Error) => e.message);
    expect(b).toBeTruthy();
    expect(err).toMatch(/booked elsewhere|taken/);
    expect(err).not.toMatch(/SuperControl/);
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

  it('upgrades a v2 demo store: the old Lodge and its requests go, old pasted links are replaced', async () => {
    await repo.reset();
    const { upgrade } = await import('./local/store');
    const old = structuredClone(S.db);
    old.v = 2;
    old.rooms.push({ id: 'x-lodge', propertyId: 'p-lodge', unitId: 'un-lodge', name: 'Whole lodge', bath: 'ensuite' });
    old.stays.push({ ...S.db.stays[0], id: 'lodge-req', roomId: 'x-lodge' });
    (old as unknown as { feeds: unknown[] }).feeds = [
      { id: 'f-x-pod1', roomId: 'x-pod1', label: 'Airbnb (sample)', url: 'https://x/a.ics' },
    ];
    const n = upgrade(old);
    expect(n.v).toBe(5);
    expect(n.rooms.some(r => r.id === 'x-lodge')).toBe(false);
    expect(n.stays.some(x => x.id === 'lodge-req')).toBe(false);
    expect(n.feeds!.every(f => typeof f.linked === 'boolean' && !('url' in f))).toBe(true);
  });

  it('upgrades a v3 demo store: requests become bookings, who booked is filled in, the rate and order arrive', async () => {
    await repo.reset();
    const { upgrade } = await import('./local/store');
    const old = structuredClone(S.db) as unknown as Record<string, unknown> & typeof S.db;
    old.v = 3;
    delete old.settings;
    old.properties = [...old.properties].reverse().map(p => ({ ...p, bedrooms: undefined }));
    const client = old.users.find(u => u.role === 'client')!.id;
    old.stays = old.stays.map(x => {
      const { bookedBy: _b, ...rest } = x;
      return rest;
    });
    old.stays.push({ ...S.db.stays[0], id: 'old-req', roomId: 'x-pod2', request: 'pending' } as never);
    const n = upgrade(old);
    expect(n.v).toBe(5);
    expect(n.settings!.ratePerRoomWeek).toBe(350);
    expect(n.properties.map(p => p.short)).toEqual([
      'Eshcol',
      'Loch Roag',
      'Harris',
      'Uig',
      'Monadh',
      'Abhainn Cottage',
    ]);
    expect(n.properties.find(p => p.short === 'Abhainn Cottage')!.bedrooms).toBe(3);
    const req = n.stays.find(x => x.id === 'old-req')!;
    expect('request' in req).toBe(false);
    expect(req.bookedBy).toBe(client);
    expect(n.stays.every(x => x.bookedBy !== undefined)).toBe(true);
  });
  it('Find a room: extras in board order, whole unit, free only when the whole stay is (bookings, Taken blocks, open-ended)', async () => {
    await repo.reset();
    as('client');
    const a = freeSpan('x-pod1', 10);
    const from = addDays(T, a);
    const to = addDays(T, a + 3);
    const before = extrasFor(S.db, from, to);
    expect(before.map(x => x.p.short)).toEqual(['Harris', 'Uig', 'Monadh', 'Abhainn Cottage']);
    expect(before.find(x => x.room.id === 'x-pod1')!.free).toBe(true);
    await repo.saveStay(ask('x-pod1', a + 2, a + 4));
    expect(extrasFor(S.db, from, to).find(x => x.room.id === 'x-pod1')!.free).toBe(false);
    expect(extrasFor(S.db, from, addDays(T, a + 2)).find(x => x.room.id === 'x-pod1')!.free).toBe(true);
    // open-ended: any later night taken means not free
    expect(extrasFor(S.db, from, null).find(x => x.room.id === 'x-pod1')!.free).toBe(false);
    // a calendar "Taken" block counts the same
    const withBlock = {
      ...S.db,
      blocks: [
        ...(S.db.blocks ?? []),
        { id: 'b-t', roomId: 'x-pod2', feedId: 'taken', from: addDays(T, a + 1), to: addDays(T, a + 2) },
      ],
    } as typeof S.db;
    expect(extrasFor(withBlock, from, to).find(x => x.room.id === 'x-pod2')!.free).toBe(false);
  });
});
