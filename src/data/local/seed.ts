import { addDays, londonToday, fmt } from '../../dates';
import { uid, iso, DEFAULT_SETTINGS } from '../core';
import type { DB, User, Stay, DepStatus, Changeover, Worker, Property, Unit, Room, Activity } from '../core';
import { PROPERTIES, UNITS, ROOMS } from '../properties';
import { demoFeeds } from './feeds';

// ---------------- seed (fictitious people) ----------------
export function seed(): DB {
  const T = londonToday();
  const d = (n: number) => addDays(T, n);
  const users: User[] = [
    { id: 'u-client', name: 'Sheena', role: 'client', email: '', phone: '' },
    {
      id: 'u-donald',
      name: 'Donald Macarthur',
      role: 'manager',
      email: 'donaldlochroag@gmail.com',
      phone: '',
      pushEnabled: true,
    },
    { id: 'u-mairi', name: 'Mairi (demo cleaner)', role: 'cleaner', email: '', phone: '' },
  ];
  const properties: Property[] = PROPERTIES.map(p => ({ ...p }));
  const units: Unit[] = UNITS.map(u => ({ ...u }));
  const rooms: Room[] = ROOMS.map(r => ({ ...r }));
  const names: [string, string, string][] = [
    ['Callum MacLeod', 'RJ McLeod', 'Prefers early breakfast'],
    ['Euan Morrison', 'RJ McLeod', '2 on / 1 off rotation'],
    ['Aleksander Nowak', 'RJ McLeod', ''],
    ['Iain Smith', 'RJ McLeod', 'Ground floor if possible'],
    ['Ruairidh Campbell', 'RJ McLeod', ''],
    ['Stuart Graham', 'RJ McLeod', ''],
    ['Marek Kowalski', 'RJ McLeod', 'Vegetarian'],
    ['Neil Mackenzie', 'RJ McLeod', ''],
    ['Daniel Reid', 'RJ McLeod', ''],
    ['Tomasz Zieliński', 'RJ McLeod', ''],
    ['Fraser Munro', 'RJ McLeod', 'Van parking needed'],
    ['Kenny Maciver', 'RJ McLeod', ''],
    ['Gary Buchanan', 'RJ McLeod', ''],
    ['Lewis Paterson', 'RJ McLeod', ''],
    ['Piotr Wiśniewski', 'RJ McLeod', ''],
    ['Alasdair Matheson', 'RJ McLeod', 'Site supervisor'],
    ['Jamie Ross', 'RJ McLeod', ''],
    ['Craig Henderson', 'RJ McLeod', ''],
  ];
  const workers: Worker[] = names.map(([n, c, notes], i) => ({
    id: `w-${i + 1}`,
    name: n,
    company: c,
    phone: `+44 7700 9${String(10200 + i).slice(-5)}`,
    notes,
    uses: 3 + ((i * 7) % 9),
    lastUsed: d(-(i % 6)),
  }));
  const S = (
    roomId: string,
    w: number | null,
    a: number,
    dep: number | null,
    depStatus: DepStatus = 'planned',
    extra: Partial<Stay> = {},
  ): Stay => ({
    id: uid(),
    roomId,
    workerId: w ? `w-${w}` : null,
    holdLabel: w ? '' : 'Name to follow',
    arrival: d(a),
    departure: dep === null ? null : d(dep),
    depStatus,
    notes: '',
    version: 1,
    updatedBy: 'u-client',
    updatedAt: iso(),
    ...extra,
  });
  const room8 = S('lr-8', 8, -14, 0, 'confirmed');
  const hold8 = S('lr-8', null, 4, null, 'tbc', { holdLabel: 'Name to follow · electrician' });
  const stays: Stay[] = [
    S('lr-1', 1, -22, 14),
    S('lr-2', 2, -9, 7),
    S('lr-2', 2, 8, 21),
    S('lr-3', 3, -41, null, 'ufn'),
    S('lr-4', 4, -4, 5),
    S('lr-4', null, 6, 20),
    S('lr-5', 5, -16, null, 'ufn', { away: { from: d(1), to: d(5) } }),
    S('lr-6', 6, -2, 10),
    S('lr-7', 7, -30, null, 'tbc'),
    room8,
    hold8,
    S('lr-9', 9, -12, 12),
    S('lr-9', 9, 12, 26),
    S('es-1', 16, -20, null, 'ufn'),
    S('es-2', 10, -6, 9),
    S('es-3', 11, -3, 2, 'confirmed'),
    S('es-4', 13, -10, 18),
    S('es-6', 14, 1, 15),
    S('es-7', 15, -18, null, 'ufn'),
    S('es-8', 12, -5, 1, 'confirmed'),
    S('es-8', 18, 1, 15),
    S('es-10', 17, -1, 13),
    // Donald's own guest in an extra property: Sheena sees these dates as "taken", never who
    S('x-cottage', null, 3, 10, 'planned', { holdLabel: 'Direct guest', bookedBy: 'u-donald', updatedBy: 'u-donald' }),
  ];
  const changeovers: Changeover[] = [
    {
      id: uid(),
      roomId: 'lr-8',
      fromStayId: room8.id,
      toStayId: hold8.id,
      afterDate: d(0),
      readyBy: d(4),
      status: 'scheduled',
      scheduledFor: d(1),
      cleanerId: 'u-mairi',
      vacated: false,
      note: 'Full turnover, fresh linen, check shared shower room',
    },
  ];
  const activity: Activity[] = [
    {
      id: uid(),
      ts: new Date(Date.now() - 36e5 * 5).toISOString(),
      userId: 'u-client',
      text: `Confirmed departure tonight for Neil Mackenzie · Loch Roag Room 8`,
      propertyId: 'p-lr',
      kind: 'stay',
    },
    {
      id: uid(),
      ts: new Date(Date.now() - 36e5 * 4.9).toISOString(),
      userId: 'u-client',
      text: `Held Loch Roag Room 8 from ${fmt(d(4))} · Name to follow`,
      propertyId: 'p-lr',
      kind: 'stay',
    },
    {
      id: uid(),
      ts: new Date(Date.now() - 36e5 * 4.8).toISOString(),
      userId: 'u-donald',
      text: `Scheduled Room 8 changeover for ${fmt(d(1))}`,
      propertyId: 'p-lr',
      kind: 'cleaning',
    },
  ];
  return {
    v: 6,
    settings: { ...DEFAULT_SETTINGS },
    rateHistory: [],
    users,
    properties,
    units,
    rooms,
    workers,
    stays,
    changeovers,
    activity,
    alerts: [],
    notices: [],
    enquiries: [],
    ...demoFeeds(T),
    currentUser: 'u-donald',
  };
}
