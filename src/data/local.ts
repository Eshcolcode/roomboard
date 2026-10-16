// Demo backend: everything lives in this browser (localStorage). Same commands as the Supabase backend.
import { addDays, londonToday, diffDays, fmt } from '../dates';
import { S, publish, uid, iso, reconcile, validate, ConflictError, roomOf, propOf, workerOf, stayLabel, roomLabel, depText } from './core';
import type { DB, Role, User, Alert, Stay, StayInput, DepStatus, Changeover, Worker, Enquiry, Property, Unit, Room, Bath, Activity, CoStatus } from './core';
import type { Repo } from './repo';
const KEY = 'roomboard-demo-v1';
// ---------------- seed (fictitious people) ----------------
function seed(): DB {
  const T = londonToday();
  const d = (n: number) => addDays(T, n);
  const users: User[] = [
    { id: 'u-client', name: 'Sarah Lennox', role: 'client', email: 'sarah@example-client.co.uk', phone: '+44 7700 900101' },
    { id: 'u-donald', name: 'Donald Macarthur', role: 'manager', email: 'donaldlochroag@gmail.com', phone: '+44 7700 900102' },
    { id: 'u-mairi', name: 'Mairi Nicolson', role: 'cleaner', email: 'mairi@example.co.uk', phone: '+44 7700 900103' },
  ];
  const properties: Property[] = [
    { id: 'p-lr', name: 'Loch Roag Guest House', short: 'Loch Roag', contracted: true, address: '22A Breasclete, Isle of Lewis HS2 9EF', blurb: '9 bedrooms, 7 ensuite and 2 sharing a shower room. Two kitchens and a large games room and lounge.', features: ['9 bedrooms', '2 kitchens', 'Games room & lounge'] },
    { id: 'p-es', name: 'Eshcol Worker Accommodation', short: 'Eshcol', contracted: true, address: 'Formerly Eshcol Guest House, Breasclete', blurb: 'A newly renovated property with private rooms, modern shower facilities, communal kitchen, lounges, games room and a separate downstairs flat.', photo: 'img/eshcol-exterior.jpg', features: ['Parking', 'High-speed Wi-Fi', 'Laundry', 'Games room'] },
    { id: 'p-pod1', name: 'Hebridean Pod 1', short: 'Pod 1', contracted: false, address: 'Isle of Lewis', blurb: 'Self-contained 1-bedroom pod. Ideal for a supervisor or a longer solo stay.', beds: '1 bedroom', features: ['1 bed', 'Self-contained', 'Parking'] },
    { id: 'p-pod2', name: 'Hebridean Pod 2', short: 'Pod 2', contracted: false, address: 'Isle of Lewis', blurb: 'Self-contained 1-bedroom pod beside Pod 1. Book both together for a pair.', beds: '1 bedroom', features: ['1 bed', 'Self-contained', 'Parking'] },
    { id: 'p-lodge', name: 'The Lodge', short: 'Lodge', contracted: false, address: 'Isle of Lewis', blurb: '2-bedroom lodge, both bedrooms ensuite. Suits two colleagues on a long rotation.', beds: '2 bedrooms · both ensuite', features: ['2 ensuite bedrooms', 'Kitchen', 'Long-term welcome'] },
    { id: 'p-cottage', name: 'The Cottage', short: 'Cottage', contracted: false, address: 'Isle of Lewis', blurb: '2 ensuite bedrooms plus a home office. A quiet base for site managers.', beds: '2 bedrooms + office', features: ['2 ensuite bedrooms', 'Home office', 'Kitchen'] },
  ];
  const units: Unit[] = [
    { id: 'un-lr', propertyId: 'p-lr', name: 'Main house' },
    { id: 'un-es-main', propertyId: 'p-es', name: 'Main accommodation' },
    { id: 'un-es-flat', propertyId: 'p-es', name: 'Downstairs flat' },
  ];
  const rooms: Room[] = [];
  for (let i = 1; i <= 9; i++) rooms.push({ id: `lr-${i}`, propertyId: 'p-lr', unitId: 'un-lr', name: `Room ${i}`, bath: i >= 8 ? 'shared' : 'ensuite', note: i >= 8 ? 'Shares shower room with Room ' + (i === 8 ? 9 : 8) : undefined });
  const esBath: Bath[] = ['private', 'ensuite', 'ensuite', 'ensuite', 'private', 'ensuite', 'ensuite', 'shared', 'shared', 'ensuite'];
  for (let i = 1; i <= 10; i++) rooms.push({ id: `es-${i}`, propertyId: 'p-es', unitId: i <= 7 ? 'un-es-main' : 'un-es-flat', name: `Room ${i}`, bath: esBath[i - 1], photo: `img/eshcol-room${i}.jpg`, note: esBath[i - 1] === 'private' ? 'Allocated private shower room, accessed separately' : esBath[i - 1] === 'shared' ? `Shares flat shower room with Room ${i === 8 ? 9 : 8}` : undefined });
  const names: [string, string, string][] = [
    ['Callum MacLeod', 'Hebridean Grid Contractors', 'Prefers early breakfast'], ['Euan Morrison', 'Hebridean Grid Contractors', '2 on / 1 off rotation'],
    ['Aleksander Nowak', 'Nordwind Turbines', ''], ['Iain Smith', 'Hebridean Grid Contractors', 'Ground floor if possible'],
    ['Ruairidh Campbell', 'Stornoway Civils', ''], ['Stuart Graham', 'Hebridean Grid Contractors', ''],
    ['Marek Kowalski', 'Nordwind Turbines', 'Vegetarian'], ['Neil Mackenzie', 'Stornoway Civils', ''],
    ['Daniel Reid', 'Hebridean Grid Contractors', ''], ['Tomasz Zieliński', 'Nordwind Turbines', ''],
    ['Fraser Munro', 'Stornoway Civils', 'Van parking needed'], ['Kenny Maciver', 'Hebridean Grid Contractors', ''],
    ['Gary Buchanan', 'Nordwind Turbines', ''], ['Lewis Paterson', 'Stornoway Civils', ''], ['Piotr Wiśniewski', 'Nordwind Turbines', ''],
    ['Alasdair Matheson', 'Hebridean Grid Contractors', 'Site supervisor'], ['Jamie Ross', 'Stornoway Civils', ''],
  ];
  const workers: Worker[] = names.map(([n, c, notes], i) => ({ id: `w-${i + 1}`, name: n, company: c, phone: `+44 7700 9${String(10200 + i).slice(-5)}`, notes, uses: 3 + (i * 7) % 9, lastUsed: d(-(i % 6)) }));
  const S = (roomId: string, w: number | null, a: number, dep: number | null, depStatus: DepStatus = 'planned', extra: Partial<Stay> = {}): Stay =>
    ({ id: uid(), roomId, workerId: w ? `w-${w}` : null, holdLabel: w ? '' : 'Name to follow', arrival: d(a), departure: dep === null ? null : d(dep), depStatus, notes: '', version: 1, updatedBy: 'u-client', updatedAt: iso(), ...extra });
  const room8 = S('lr-8', 8, -14, 0, 'confirmed');
  const hold8 = S('lr-8', null, 4, null, 'tbc', { holdLabel: 'Name to follow · electrician' });
  const stays: Stay[] = [
    S('lr-1', 1, -22, 14), S('lr-2', 2, -9, 7), S('lr-2', 2, 8, 21), S('lr-3', 3, -41, null, 'ufn'), S('lr-4', 4, -4, 5),
    S('lr-4', null, 6, 20), S('lr-5', 5, -16, null, 'ufn', { away: { from: d(1), to: d(5) } }), S('lr-6', 6, -2, 10), S('lr-7', 7, -30, null, 'tbc'),
    room8, hold8, S('lr-9', 9, -12, 12),
    S('es-1', 16, -20, null, 'ufn'), S('es-2', 10, -6, 9), S('es-3', 11, -3, 2, 'confirmed'), S('es-4', 13, -10, 18), S('es-6', 14, 1, 15),
    S('es-7', 15, -18, null, 'ufn'), S('es-8', 12, -5, 1, 'confirmed'), S('es-10', 17, -1, 13),
  ];
  const changeovers: Changeover[] = [
    { id: uid(), roomId: 'lr-8', fromStayId: room8.id, toStayId: hold8.id, afterDate: d(0), readyBy: d(4), status: 'scheduled', scheduledFor: d(1), cleanerId: 'u-mairi', note: 'Full turnover, fresh linen, check shared shower room' },
  ];
  const activity: Activity[] = [
    { id: uid(), ts: new Date(Date.now() - 36e5 * 5).toISOString(), userId: 'u-client', text: `Confirmed departure tonight for Neil Mackenzie · Loch Roag Room 8`, propertyId: 'p-lr' },
    { id: uid(), ts: new Date(Date.now() - 36e5 * 4.9).toISOString(), userId: 'u-client', text: `Held Loch Roag Room 8 from ${fmt(d(4))} · Name to follow`, propertyId: 'p-lr' },
    { id: uid(), ts: new Date(Date.now() - 36e5 * 4.8).toISOString(), userId: 'u-donald', text: `Scheduled Room 8 changeover for ${fmt(d(1))} · Mairi Nicolson`, propertyId: 'p-lr' },
  ];
  return { v: 1, users, properties, units, rooms, workers, stays, changeovers, activity, alerts: [], enquiries: [], currentUser: 'u-donald' };
}


function load(): DB { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch { /* ignore */ } const x = seed(); reconcile(x); return x; }
function commit() { const n = { ...S.db }; localStorage.setItem(KEY, JSON.stringify(n)); publish(n); }
function log(text: string, propertyId?: string) { S.db.activity = [{ id: uid(), ts: iso(), userId: S.db.currentUser, text, propertyId }, ...S.db.activity].slice(0, 300); }
function queue(channel: Alert['channel'], to: User, subject: string, body: string) {
  S.db.alerts = [{ id: uid(), ts: iso(), channel, to: `${to.name} <${channel === 'sms' ? to.phone : to.email}>`, subject, body, status: 'queued' as const, attempts: 0, nextAttemptAt: Date.now() + 1500 }, ...S.db.alerts].slice(0, 200);
}
function notify(audience: Role[], subject: string, body: string, sms = false) {
  for (const u of S.db.users) if (audience.includes(u.role) && u.id !== S.db.currentUser) {
    queue('push', u, subject, body); queue('email', u, subject, body); if (sms) queue('sms', u, subject, body);
  }
}

function saveStay(inp: StayInput): Stay {
  if (inp.depStatus === 'tbc' || inp.depStatus === 'ufn') inp = { ...inp, departure: null };
  const err = validate(inp); if (err) throw new Error(err);
  const r = roomOf(inp.roomId); const who = inp.workerId ? workerOf(inp.workerId)!.name : inp.holdLabel || 'Name to follow';
  if (inp.workerId) { const w = workerOf(inp.workerId)!; w.uses++; w.lastUsed = londonToday(); }
  if (inp.id) {
    const cur = S.db.stays.find(s => s.id === inp.id)!;
    if (cur.version !== inp.version) throw new ConflictError(`This stay was changed by ${S.db.users.find(u => u.id === cur.updatedBy)?.name ?? 'someone else'} while you were editing. Reload to see the latest before saving.`);
    const changes: string[] = [];
    if (!cur.workerId && inp.workerId) changes.push(`named hold as ${who}`);
    else if (cur.workerId !== inp.workerId) changes.push(`changed guest to ${who}`);
    if (cur.roomId !== inp.roomId) changes.push(`moved to ${r.name}`);
    if (cur.arrival !== inp.arrival) changes.push(`arrival ${fmt(cur.arrival)} → ${fmt(inp.arrival)}`);
    if (cur.departure !== inp.departure || cur.depStatus !== inp.depStatus) changes.push(`departure ${depText(cur)} → ${depText({ ...cur, ...inp } as Stay)}`);
    if (JSON.stringify(cur.away ?? null) !== JSON.stringify(inp.away)) changes.push(inp.away ? `away (room retained) ${fmt(inp.away.from)}–${fmt(inp.away.to)}` : 'cleared away dates');
    const extended = (cur.departure ?? '9') < (inp.departure ?? '9~') || (inp.depStatus !== cur.depStatus && (inp.depStatus === 'ufn' || inp.depStatus === 'tbc'));
    const broughtForward = inp.arrival < cur.arrival;
    Object.assign(cur, inp, { version: cur.version + 1, updatedBy: S.db.currentUser, updatedAt: iso() });
    const text = `${roomLabel(cur.roomId)} · ${stayLabel(cur)}: ${changes.join(', ') || 'details updated'}`;
    log(text, r.propertyId);
    const before = S.db.changeovers.map(c => c.status + c.id);
    reconcile(S.db);
    const invalid = S.db.changeovers.filter(c => c.invalidated && before.some(b => b.endsWith(c.id) && !b.startsWith('needs')));
    for (const c of invalid) notify(['manager', 'cleaner', 'client'], `⚠ ${roomLabel(c.roomId)} no longer ready`, `${c.invalidated}. ${extended ? 'Stay was extended.' : broughtForward ? 'Arrival brought forward.' : ''}`, true);
    notify(['manager', 'cleaner', 'client'], `Stay updated · ${roomLabel(cur.roomId)}`, text, cur.departure === londonToday() || broughtForward);
    commit(); return cur;
  }
  const s: Stay = { id: uid(), ...inp, version: 1, updatedBy: S.db.currentUser, updatedAt: iso() } as Stay;
  S.db.stays.push(s);
  const text = `${inp.workerId ? 'Booked' : 'Held'} ${roomLabel(s.roomId)} for ${who} from ${fmt(s.arrival)} → ${depText(s)}`;
  log(text, r.propertyId); reconcile(S.db);
  notify(['manager', 'cleaner', 'client'], inp.workerId ? `New arrival · ${roomLabel(s.roomId)}` : `Room held · ${roomLabel(s.roomId)}`, text, diffDays(londonToday(), s.arrival) <= 2);
  commit(); return s;
}
function deleteStay(id: string) {
  const s = S.db.stays.find(x => x.id === id)!; S.db.stays = S.db.stays.filter(x => x.id !== id);
  log(`Cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)} (${fmt(s.arrival)})`, roomOf(s.roomId).propertyId); reconcile(S.db);
  notify(['manager', 'cleaner', 'client'], `Stay cancelled · ${roomLabel(s.roomId)}`, `${stayLabel(s)} from ${fmt(s.arrival)} cancelled`); commit();
}
function confirmDeparture(id: string) {
  const s = S.db.stays.find(x => x.id === id)!; s.depStatus = 'confirmed'; s.version++; s.updatedBy = S.db.currentUser; s.updatedAt = iso();
  log(`Confirmed departure of ${stayLabel(s)} · ${roomLabel(s.roomId)} on ${fmt(s.departure!)}`, roomOf(s.roomId).propertyId);
  notify(['manager', 'cleaner'], `Departure confirmed · ${roomLabel(s.roomId)}`, `${stayLabel(s)} leaves ${fmt(s.departure!)}`, true); commit();
}
function updateChangeover(id: string, patch: Partial<Changeover>) {
  const c = S.db.changeovers.find(x => x.id === id)!; Object.assign(c, patch);
  if (patch.status) c.invalidated = undefined;
  const label: Record<CoStatus, string> = { needs: 'Needs scheduling', scheduled: 'Scheduled', in_progress: 'In progress', ready: 'Ready' };
  const t = `Changeover ${roomLabel(c.roomId)} → ${label[c.status]}${c.scheduledFor ? ' · ' + fmt(c.scheduledFor) : ''}`;
  log(t, roomOf(c.roomId).propertyId); notify(c.status === 'ready' ? ['client', 'manager'] : ['manager', 'cleaner', 'client'], t, t, c.status === 'scheduled'); commit();
}
function upsertWorker(w: Partial<Worker> & { name: string }) {
  if (w.id) Object.assign(workerOf(w.id)!, w); else { const nw: Worker = { id: uid(), company: '', phone: '', notes: '', uses: 0, ...w } as Worker; S.db.workers.push(nw); log(`Added worker ${nw.name}`); commit(); return nw; }
  log(`Updated worker ${w.name}`); commit(); return workerOf(w.id!)!;
}
function addEnquiry(e: Omit<Enquiry, 'id' | 'ts' | 'status'>) {
  S.db.enquiries = [{ ...e, id: uid(), ts: iso(), status: 'new' }, ...S.db.enquiries];
  const t = `Enquiry for ${propOf(e.propertyId).name}: ${e.people} people from ${fmt(e.from)}${e.longTerm ? ' (long-term)' : e.to ? ' to ' + fmt(e.to) : ''}`;
  log(t, e.propertyId); notify(['manager'], 'New accommodation request', t + (e.note ? ` — "${e.note}"` : ''), true); commit();
}
// Simulated alert outbox with retry/backoff — mirrors the Supabase dispatcher.
function tick() {
  let changed = false; const now = Date.now();
  for (const a of S.db.alerts) if (a.status === 'queued' && a.nextAttemptAt <= now) {
    a.attempts++; changed = true;
    const fail = a.channel === 'sms' && a.attempts === 1 && Math.random() < 0.35; // demo a transient SMS failure
    if (fail) { a.nextAttemptAt = now + 4000 * a.attempts; } else a.status = 'sent';
    if (a.attempts >= 5 && a.status !== 'sent') a.status = 'failed';
  }
  if (changed) commit();
}


export const localRepo: Repo = {
  mode: 'demo',
  async init() { publish(load()); setInterval(tick, 1000); },
  async saveStay(i) { return saveStay(i); },
  async deleteStay(id) { deleteStay(id); },
  async confirmDeparture(id) { confirmDeparture(id); },
  async updateChangeover(id, p) { updateChangeover(id, p); },
  async upsertWorker(w) { return upsertWorker(w); },
  async addEnquiry(e) { addEnquiry(e); },
  async setUser(id) { S.db.currentUser = id; commit(); },
  async reset() { localStorage.removeItem(KEY); const x = seed(); reconcile(x); publish(x); commit(); },
};
