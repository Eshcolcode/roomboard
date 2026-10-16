// Demo backend: everything lives in this browser (localStorage). Same commands as the Supabase backend.
import { addDays, londonToday, diffDays, fmt } from '../dates';
import { cleanWindow, statusGate } from './rules';
import {
  S,
  publish,
  uid,
  iso,
  reconcile,
  CO_LABEL,
  validate,
  ConflictError,
  roomOf,
  propOf,
  workerOf,
  stayLabel,
  roomLabel,
  depText,
} from './core';
import type {
  CoEvent,
  DB,
  Role,
  User,
  Alert,
  Stay,
  StayInput,
  DepStatus,
  Changeover,
  Worker,
  Enquiry,
  Property,
  Unit,
  Room,
  Bath,
  Activity,
  CoStatus,
} from './core';
import type { Repo } from './repo';
const KEY = 'roomboard-demo-v2'; // bumped: changeover model changed
// ---------------- seed (fictitious people) ----------------
function seed(): DB {
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

function load(): DB {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
  } catch {
    /* ignore */
  }
  const x = seed();
  reconcile(x);
  // persist straight away so a second tab opened now shares the same records (and ids)
  try {
    localStorage.setItem(KEY, JSON.stringify(x));
  } catch {
    /* storage full or blocked: demo still works in this tab */
  }
  return x;
}
// Undo: snapshot of stays + changeovers before each stay command. Activity/alerts are kept (they happened).
interface Snap {
  label: string;
  stays: Stay[];
  changeovers: Changeover[];
}
const undoStack: Snap[] = [];
function snap(label: string) {
  undoStack.push({ label, stays: structuredClone(S.db.stays), changeovers: structuredClone(S.db.changeovers) });
  if (undoStack.length > 20) undoStack.shift();
}
function undo() {
  const u = undoStack.pop();
  if (!u) return;
  const bump = new Map(S.db.stays.map(s => [s.id, s.version]));
  S.db.stays = u.stays.map(s => ({
    ...s,
    version: Math.max(s.version, bump.get(s.id) ?? 0) + 1,
    updatedBy: S.db.currentUser,
    updatedAt: iso(),
  }));
  S.db.changeovers = u.changeovers;
  log(`Undid: ${u.label}`);
  alertStayChange('Change undone', `Undid: ${u.label}`);
  commit();
}
function commit() {
  const n = { ...S.db };
  localStorage.setItem(KEY, JSON.stringify(n));
  publish(n);
}
function log(text: string, propertyId?: string) {
  S.db.activity = [{ id: uid(), ts: iso(), userId: S.db.currentUser, text, propertyId }, ...S.db.activity].slice(
    0,
    300,
  );
}
// ---- alert routing (mirrors enqueue_for() in 0002_rules.sql) ----
// One channel per user by default (email). SMS only if the user opted in; push only if enabled. Never alert the actor.
function queueFor(u: User, subject: string, body: string) {
  if (u.id === S.db.currentUser) return;
  const chans: Alert['channel'][] = ['email'];
  if (u.smsOptIn) chans.push('sms');
  if (u.pushEnabled) chans.push('push');
  for (const ch of chans) {
    const addr = ch === 'sms' ? u.phone : ch === 'email' ? u.email : 'app';
    S.db.alerts = [
      {
        id: uid(),
        ts: iso(),
        channel: ch,
        toUserId: u.id,
        to: `${u.name} <${addr || 'no address yet'}>`,
        subject,
        body,
        status: addr ? ('queued' as const) : ('no_address' as const),
        attempts: 0,
        nextAttemptAt: Date.now() + 1500,
      },
      ...S.db.alerts,
    ].slice(0, 200);
  }
}
const usersOf = (r: Role) => S.db.users.filter(u => u.role === r);
const actorRole = () => S.db.users.find(u => u.id === S.db.currentUser)?.role;
/** stay changes: provider edits → client; client edits → provider */
function alertStayChange(subject: string, body: string) {
  const a = actorRole();
  const to = a === 'client' ? usersOf('manager') : a === 'manager' ? usersOf('client') : [];
  to.forEach(u => queueFor(u, subject, body));
}
/** changeover events → cleaners (assigned one if set); invalidations/cancellations also → provider */
function alertChangeover(c: Changeover, subject: string, body: string, alsoProvider = false) {
  const cl = c.cleanerId ? S.db.users.filter(u => u.id === c.cleanerId) : usersOf('cleaner');
  cl.forEach(u => queueFor(u, subject, body));
  if (alsoProvider) usersOf('manager').forEach(u => queueFor(u, subject, body));
}
function handle(ev: CoEvent[]) {
  for (const e of ev) {
    const rl = roomLabel(e.roomId);
    const pid = roomOf(e.roomId).propertyId;
    if (e.kind === 'invalidated' && e.co) {
      log(`⚠ ${rl}: dates changed, the clean needs booking again`, pid);
      alertChangeover(e.co, `⚠ ${rl}: book the clean again`, e.text, true);
    }
    if (e.kind === 'cancelled' && e.co) {
      log(`⚠ ${rl}: departure removed after the clean was booked – check if still needed`, pid);
      alertChangeover(e.co, `⚠ ${rl}: clean may not be needed`, e.text, true);
    }
    if (e.kind === 'moved' && e.co) {
      log(`${rl} clean: ${e.text}`, pid);
      if (e.co.status !== 'needs') alertChangeover(e.co, `${rl}: needed-by date moved`, e.text);
    }
    if (e.kind === 'continues') log(`${rl}: same worker continues, no clean needed`, pid);
    if (e.kind === 'created' && e.co?.zeroDay)
      log(`⚠ ${rl}: same-day changeover (departure and arrival ${fmt(e.co.afterDate)})`, pid);
  }
}

function saveStay(inp: StayInput): Stay {
  if (inp.depStatus === 'tbc' || inp.depStatus === 'ufn') inp = { ...inp, departure: null };
  const err = validate(inp);
  if (err) throw new Error(err);
  if (inp.id) {
    const cur = S.db.stays.find(s => s.id === inp.id);
    if (cur && cur.version === inp.version) snap(`change to ${stayLabel(cur)} · ${roomLabel(cur.roomId)}`);
  } else snap(`new stay · ${roomLabel(inp.roomId)}`);
  const r = roomOf(inp.roomId);
  const who = inp.workerId ? workerOf(inp.workerId)!.name : inp.holdLabel || 'Name to follow';
  if (inp.workerId) {
    const w = workerOf(inp.workerId)!;
    w.uses++;
    w.lastUsed = londonToday();
  }
  if (inp.id) {
    const cur = S.db.stays.find(s => s.id === inp.id);
    if (!cur) throw new ConflictError('This stay was cancelled by someone else.');
    if (cur.version !== inp.version)
      throw new ConflictError(
        `This stay was changed by ${S.db.users.find(u => u.id === cur.updatedBy)?.name ?? 'someone else'} while you were editing. Reload to see the latest before saving.`,
      );
    const changes: string[] = [];
    if (!cur.workerId && inp.workerId) changes.push(`named hold as ${who}`);
    else if (cur.workerId !== inp.workerId) changes.push(`changed guest to ${who}`);
    if (cur.roomId !== inp.roomId) changes.push(`moved to ${r.name}`);
    if (cur.arrival !== inp.arrival) changes.push(`arrival ${fmt(cur.arrival)} → ${fmt(inp.arrival)}`);
    if (cur.departure !== inp.departure || cur.depStatus !== inp.depStatus)
      changes.push(`departure ${depText(cur)} → ${depText({ ...cur, ...inp } as Stay)}`);
    if (JSON.stringify(cur.away ?? null) !== JSON.stringify(inp.away ?? null))
      changes.push(inp.away ? `away (room retained) ${fmt(inp.away.from)}–${fmt(inp.away.to)}` : 'cleared away dates');
    if ((cur.notes ?? '') !== (inp.notes ?? '')) changes.push('notes updated');
    Object.assign(cur, inp, { version: cur.version + 1, updatedBy: S.db.currentUser, updatedAt: iso() });
    const text = `${roomLabel(cur.roomId)} · ${stayLabel(cur)}: ${changes.join(', ') || 'no changes'}`;
    log(text, r.propertyId);
    handle(reconcile(S.db));
    if (changes.length) alertStayChange(`Stay updated · ${roomLabel(cur.roomId)}`, text);
    commit();
    return cur;
  }
  const s: Stay = { id: uid(), ...inp, version: 1, updatedBy: S.db.currentUser, updatedAt: iso() } as Stay;
  S.db.stays.push(s);
  const text = `${inp.workerId ? 'Booked' : 'Held'} ${roomLabel(s.roomId)} for ${who} from ${fmt(s.arrival)} → ${depText(s)}`;
  log(text, r.propertyId);
  handle(reconcile(S.db));
  alertStayChange(inp.workerId ? `New arrival · ${roomLabel(s.roomId)}` : `Room held · ${roomLabel(s.roomId)}`, text);
  commit();
  return s;
}
function deleteStay(id: string) {
  const s = S.db.stays.find(x => x.id === id);
  if (!s) return;
  snap(`cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)}`);
  S.db.stays = S.db.stays.filter(x => x.id !== id);
  log(`Cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)} (${fmt(s.arrival)})`, roomOf(s.roomId).propertyId);
  handle(reconcile(S.db));
  alertStayChange(`Stay cancelled · ${roomLabel(s.roomId)}`, `${stayLabel(s)} from ${fmt(s.arrival)} cancelled`);
  commit();
}
function confirmDeparture(id: string) {
  {
    const c = S.db.stays.find(x => x.id === id);
    if (c) snap(`departure confirmed · ${roomLabel(c.roomId)}`);
  }
  const s = S.db.stays.find(x => x.id === id)!;
  s.depStatus = 'confirmed';
  s.version++;
  s.updatedBy = S.db.currentUser;
  s.updatedAt = iso();
  const t = `Confirmed departure of ${stayLabel(s)} · ${roomLabel(s.roomId)} on ${fmt(s.departure!)}`;
  log(t, roomOf(s.roomId).propertyId);
  alertStayChange(`Departure confirmed · ${roomLabel(s.roomId)}`, t);
  commit();
}
function updateChangeover(id: string, patch: Partial<Changeover>) {
  const c = S.db.changeovers.find(x => x.id === id);
  if (!c) throw new Error('This changeover no longer exists.');
  const next = { ...c, ...patch };
  const T = londonToday();
  // Sequence: departure → clean → ready, all before the next arrival. Out-of-window only as an explicit provider exception.
  if (patch.scheduledFor !== undefined && next.scheduledFor) {
    const w = cleanWindow(c.afterDate, c.readyBy, next.scheduledFor);
    const bad =
      w === 'before_departure'
        ? `A clean can't be before the guest leaves (${fmt(c.afterDate)}).`
        : w === 'after_next_arrival'
          ? `The clean must be on or before the next arrival (${fmt(c.readyBy!)}).`
          : '';
    if (bad && !(patch.exception && actorRole() === 'manager')) throw new Error(bad);
    if (!bad) c.exception = undefined;
  }
  const gate = (t: 'vacated' | 'in_progress' | 'ready') => statusGate(t, !!next.vacated, T, c.afterDate);
  if (patch.vacated && gate('vacated'))
    throw new Error(`"Left" can be ticked from the departure day (${fmt(c.afterDate)}).`);
  if (patch.status === 'in_progress' && gate('in_progress'))
    throw new Error('Tick "Guest has left" before starting the clean.');
  if (patch.status === 'ready' && gate('ready')) throw new Error('Ready needs "Guest has left" ticked first.');
  if (next.status === 'ready' && c.exception) c.exception = undefined;
  const was = c.status;
  Object.assign(c, patch);
  if (patch.exception)
    log(
      `⚠ ${roomLabel(c.roomId)}: clean booked outside the usual window – ${patch.exception}`,
      roomOf(c.roomId).propertyId,
    );
  if (patch.status) c.invalidated = undefined;
  const rl = roomLabel(c.roomId);
  const pid = roomOf(c.roomId).propertyId;
  if (patch.vacated !== undefined && patch.status === undefined) {
    log(`${rl}: ${c.vacated ? 'guest has left ✓' : '"guest has left" untick'}`, pid);
    commit();
    return;
  }
  const t = `${rl} clean → ${CO_LABEL[c.status]}${c.scheduledFor && c.status !== 'ready' ? ' · ' + fmt(c.scheduledFor) : ''}`;
  log(t, pid);
  if (c.status === 'ready')
    usersOf('client').forEach(u => queueFor(u, `${rl} is ready`, `${rl} is ready for the next arrival`));
  else if (c.status === 'scheduled')
    alertChangeover(c, was === 'needs' && c.scheduledFor ? `Clean scheduled · ${rl}` : `Clean rescheduled · ${rl}`, t);
  commit();
}
function dismissChangeover(id: string) {
  const c = S.db.changeovers.find(x => x.id === id);
  if (!c) return;
  S.db.changeovers = S.db.changeovers.filter(x => x.id !== id);
  log(`Dismissed flagged changeover ${roomLabel(c.roomId)}`, roomOf(c.roomId).propertyId);
  alertChangeover(c, `Clean cancelled · ${roomLabel(c.roomId)}`, 'No longer needed');
  commit();
}
function upsertWorker(w: Partial<Worker> & { name: string }) {
  if (w.id) Object.assign(workerOf(w.id)!, w);
  else {
    const nw: Worker = { id: uid(), company: '', phone: '', notes: '', uses: 0, ...w } as Worker;
    S.db.workers.push(nw);
    log(`Added worker ${nw.name}`);
    commit();
    return nw;
  }
  log(`Updated worker ${w.name}`);
  commit();
  return workerOf(w.id!)!;
}
function addEnquiry(e: Omit<Enquiry, 'id' | 'ts' | 'status'>) {
  if (!e.from) throw new Error('Choose a start date.');
  if (!e.longTerm && (!e.to || e.to <= e.from))
    throw new Error('End date must be after the start date, or tick long-term.');
  if (!(e.people >= 1 && e.people <= 50)) throw new Error('People must be between 1 and 50.');
  S.db.enquiries = [{ ...e, id: uid(), ts: iso(), status: 'new' }, ...S.db.enquiries];
  const t = `Enquiry for ${propOf(e.propertyId).name}: ${e.people} people from ${fmt(e.from)}${e.longTerm ? ' (long-term)' : e.to ? ' to ' + fmt(e.to) : ''}`;
  log(t, e.propertyId);
  usersOf('manager').forEach(u => queueFor(u, 'New accommodation request', t + (e.note ? ` — "${e.note}"` : '')));
  commit();
}
// Simulated alert outbox with retry/backoff — mirrors the Supabase dispatcher.
function tick() {
  let changed = false;
  const now = Date.now();
  for (const a of S.db.alerts)
    if (a.status === 'queued' && a.nextAttemptAt <= now) {
      a.attempts++;
      changed = true;
      const fail = a.channel === 'sms' && a.attempts === 1 && Math.random() < 0.35; // demo a transient SMS failure
      if (fail) {
        a.nextAttemptAt = now + 4000 * a.attempts;
      } else a.status = 'simulated'; // demo: nothing is actually sent
      if (a.attempts >= 5 && a.status === 'queued') a.status = 'failed';
    }
  if (changed) commit();
}

export const localRepo: Repo = {
  mode: 'demo',
  async init() {
    publish(load());
    setInterval(tick, 1000);
    // keep tabs in sync so stale edits are detected across tabs too
    addEventListener('storage', e => {
      if (e.key === KEY && e.newValue) {
        const cur = S.db.currentUser;
        publish({ ...JSON.parse(e.newValue), currentUser: cur });
      }
    });
  },
  async saveStay(i) {
    return saveStay(i);
  },
  async deleteStay(id) {
    deleteStay(id);
  },
  async confirmDeparture(id) {
    confirmDeparture(id);
  },
  async updateChangeover(id, p) {
    updateChangeover(id, p);
  },
  async dismissChangeover(id) {
    dismissChangeover(id);
  },
  async updateProperty(id, p) {
    Object.assign(
      S.db.properties.find(x => x.id === id)!,
      p,
    );
    log(
      `Updated default times for ${S.db.properties.find(x => x.id === id)!.name}: checkout ${p.checkout ?? ''} check-in ${p.checkin ?? ''}`,
    );
    commit();
  },
  async setPrefs(id, p) {
    Object.assign(
      S.db.users.find(u => u.id === id)!,
      p,
    );
    commit();
  },
  async upsertWorker(w) {
    return upsertWorker(w);
  },
  async undo() {
    undo();
  },
  canUndo: () => undoStack.length > 0,
  async addEnquiry(e) {
    addEnquiry(e);
  },
  async setUser(id) {
    S.db.currentUser = id;
    commit();
  },
  async reset() {
    undoStack.length = 0;
    localStorage.removeItem(KEY);
    const x = seed();
    reconcile(x);
    publish(x);
    commit();
  },
};
