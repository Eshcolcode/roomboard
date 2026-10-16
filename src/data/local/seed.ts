import { addDays, londonToday, fmt } from '../../dates';
import { uid, iso } from '../core';
import type { DB, User, Stay, DepStatus, Changeover, Worker, Property, Unit, Room, Bath, Activity } from '../core';

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
  const properties: Property[] = [
    {
      id: 'p-lr',
      name: 'Loch Roag Guest House',
      short: 'Loch Roag',
      contracted: true,
      checkout: '10:00',
      checkin: '15:00',
      address: '22A Breasclete, Isle of Lewis HS2 9EF',
      blurb:
        '9 bedrooms: Rooms 1–5 upstairs, 6–9 downstairs. Rooms 2 and 3 share a shower room, Room 8 has a private shower room, the rest are ensuite. Two kitchens, large games room and lounge. Images to follow.',
      features: ['9 bedrooms', '2 kitchens', 'Games room & lounge'],
    },
    {
      id: 'p-es',
      name: 'Eshcol Worker Accommodation',
      short: 'Eshcol',
      contracted: true,
      checkout: '10:00',
      checkin: '15:00',
      address: 'Formerly Eshcol Guest House, Breasclete',
      blurb:
        'A newly renovated property with private rooms, modern shower facilities, communal kitchen, lounges, games room and a separate downstairs flat.',
      photo: 'img/eshcol-exterior.jpg',
      features: ['Parking', 'High-speed Wi-Fi', 'Laundry', 'Games room'],
    },
    {
      id: 'p-pod1',
      brand: 'Hebridean Holiday Cabins',
      name: 'Pod 1',
      short: 'Pod 1',
      contracted: false,
      address: 'Isle of Lewis',
      blurb: 'Self-contained 1-bedroom pod. Ideal for a supervisor or a longer solo stay.',
      beds: '1 bedroom',
      features: ['1 bed', 'Self-contained', 'Parking'],
    },
    {
      id: 'p-pod2',
      brand: 'Hebridean Holiday Cabins',
      name: 'Pod 2',
      short: 'Pod 2',
      contracted: false,
      address: 'Isle of Lewis',
      blurb: 'Self-contained 1-bedroom pod beside Pod 1. Book both together for a pair.',
      beds: '1 bedroom',
      features: ['1 bed', 'Self-contained', 'Parking'],
    },
    {
      id: 'p-lodge',
      brand: 'Hebridean Holiday Cabins',
      name: 'The Lodge',
      short: 'Lodge',
      contracted: false,
      address: 'Isle of Lewis',
      blurb: '2-bedroom lodge, both bedrooms ensuite. Suits two colleagues on a long rotation.',
      beds: '2 bedrooms · both ensuite',
      features: ['2 ensuite bedrooms', 'Kitchen', 'Long-term welcome'],
    },
    {
      id: 'p-cottage',
      brand: 'Hebridean Holiday Cabins',
      name: 'The Cottage',
      short: 'Cottage',
      contracted: false,
      address: 'Isle of Lewis',
      blurb: '2 ensuite bedrooms plus a home office. A quiet base for site managers.',
      beds: '2 bedrooms + office',
      features: ['2 ensuite bedrooms', 'Home office', 'Kitchen'],
    },
    {
      id: 'p-monadh',
      brand: 'Whitefalls Spa Lodges',
      name: 'Monadh',
      short: 'Monadh',
      contracted: false,
      address: 'Whitefalls, Breasclete',
      blurb: 'A Whitefalls Spa Lodge. A premium option for a senior visitor or a longer stay.',
      beds: 'Spa lodge',
      features: ['Spa lodge', 'Self-contained', 'Long-term welcome'],
    },
  ];
  const units: Unit[] = [
    { id: 'un-lr-up', propertyId: 'p-lr', name: 'Upstairs · Rooms 1–5' },
    { id: 'un-lr-down', propertyId: 'p-lr', name: 'Downstairs · Rooms 6–9' },
    { id: 'un-es-main', propertyId: 'p-es', name: 'Main house · Rooms 1–7' },
    { id: 'un-es-flat', propertyId: 'p-es', name: 'Downstairs flat · Rooms 8–10' },
  ];
  const rooms: Room[] = [];
  for (let i = 1; i <= 9; i++) {
    const bath: Bath = i === 2 || i === 3 ? 'shared' : i === 8 ? 'private' : 'ensuite';
    rooms.push({
      id: `lr-${i}`,
      propertyId: 'p-lr',
      unitId: i <= 5 ? 'un-lr-up' : 'un-lr-down',
      floor: i <= 5 ? 'Upstairs' : 'Downstairs',
      name: `Room ${i}`,
      bath,
      note:
        bath === 'shared'
          ? `Shares a shower room with Room ${i === 2 ? 3 : 2}`
          : bath === 'private'
            ? 'Private shower room (not ensuite)'
            : 'Ensuite',
    });
  }
  const esBath: Bath[] = [
    'private',
    'ensuite',
    'ensuite',
    'ensuite',
    'private',
    'ensuite',
    'ensuite',
    'shared',
    'shared',
    'ensuite',
  ];
  for (let i = 1; i <= 10; i++)
    rooms.push({
      id: `es-${i}`,
      propertyId: 'p-es',
      floor: i <= 7 ? 'Main house' : 'Downstairs flat',
      unitId: i <= 7 ? 'un-es-main' : 'un-es-flat',
      name: `Room ${i}`,
      bath: esBath[i - 1],
      photo: `img/eshcol-room${i}.jpg`,
      note:
        esBath[i - 1] === 'private'
          ? 'Allocated private shower room, accessed separately'
          : esBath[i - 1] === 'shared'
            ? `Shares flat shower room with Room ${i === 8 ? 9 : 8}`
            : undefined,
    });
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
    },
    {
      id: uid(),
      ts: new Date(Date.now() - 36e5 * 4.9).toISOString(),
      userId: 'u-client',
      text: `Held Loch Roag Room 8 from ${fmt(d(4))} · Name to follow`,
      propertyId: 'p-lr',
    },
    {
      id: uid(),
      ts: new Date(Date.now() - 36e5 * 4.8).toISOString(),
      userId: 'u-donald',
      text: `Scheduled Room 8 changeover for ${fmt(d(1))}`,
      propertyId: 'p-lr',
    },
  ];
  return {
    v: 1,
    users,
    properties,
    units,
    rooms,
    workers,
    stays,
    changeovers,
    activity,
    alerts: [],
    enquiries: [],
    currentUser: 'u-donald',
  };
}
