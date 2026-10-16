// Shared model + pure rules. Both data backends (local demo, Supabase) fill the same snapshot shape.
import { useSyncExternalStore } from 'react';
import { addDays, londonToday, overlaps, diffDays, fmt } from '../dates';
export type Role = 'client' | 'manager' | 'cleaner';
export type Bath = 'ensuite' | 'private' | 'shared';
export interface User { id: string; name: string; role: Role; email: string; phone: string; smsOptIn?: boolean; pushEnabled?: boolean }
export interface Property { id: string; name: string; short: string; contracted: boolean; address: string; blurb: string; photo?: string; features: string[]; beds?: string; brand?: string; checkout?: string; checkin?: string }
export interface Unit { id: string; propertyId: string; name: string }
export interface Room { id: string; propertyId: string; unitId: string; name: string; bath: Bath; note?: string; photo?: string; floor?: string }
export interface Worker { id: string; name: string; company: string; phone: string; notes: string; lastUsed?: string; uses: number }
export type DepStatus = 'planned' | 'confirmed' | 'tbc' | 'ufn';
export interface Stay {
  id: string; roomId: string; workerId: string | null; holdLabel: string;
  arrival: string; departure: string | null; depStatus: DepStatus;
  away?: { from: string; to: string } | null; // Away, room retained: no clean
  checkedOut?: boolean; notes: string; version: number; updatedBy: string; updatedAt: string;
}
export type CoStatus = 'needs' | 'scheduled' | 'in_progress' | 'ready';
export interface Changeover {
  id: string; roomId: string; fromStayId: string | null; toStayId: string | null;
  afterDate: string; readyBy: string | null; status: CoStatus; scheduledFor: string | null; cleanerId: string | null; note: string;
  vacated?: boolean;          // provider/cleaner recorded that the person actually left. Ready requires it.
  zeroDay?: boolean;          // next arrival is on the departure day (different worker)
  invalidated?: string;       // reason a scheduled/ready changeover needs rescheduling
  cancelled?: string;
  exception?: string;         // provider forced a clean date outside departure→next-arrival window; stays flagged until resolved         // departure removed after scheduling: kept (never silently deleted) until provider dismisses
}
export interface Activity { id: string; ts: string; userId: string; text: string; propertyId?: string }
export interface Alert { id: string; ts: string; channel: 'email' | 'sms' | 'push'; toUserId?: string; to: string; subject: string; body: string; status: 'queued' | 'simulated' | 'accepted' | 'delivered' | 'failed' | 'acknowledged' | 'no_address'; attempts: number; nextAttemptAt: number }
export interface Enquiry { id: string; ts: string; propertyId: string; from: string; to: string | null; longTerm: boolean; people: number; note: string; status: 'new' | 'replied' }
export interface DB { v: number; users: User[]; properties: Property[]; units: Unit[]; rooms: Room[]; workers: Worker[]; stays: Stay[]; changeovers: Changeover[]; activity: Activity[]; alerts: Alert[]; enquiries: Enquiry[]; currentUser: string; authRequired?: boolean }


export const S = { db: null as unknown as DB };
const subs = new Set<() => void>();
export function publish(next: DB) { S.db = next; subs.forEach(f => f()); }
export const useDB = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => S.db);
export const getDB = () => S.db;
export const me = () => S.db.users.find(u => u.id === S.db.currentUser) ?? S.db.users[0];
export const uid = () => Math.random().toString(36).slice(2, 10);
export const iso = () => new Date().toISOString();
// ---------------- helpers ----------------
export const roomOf = (id: string) => S.db.rooms.find(r => r.id === id)!;
export const propOf = (id: string) => S.db.properties.find(p => p.id === id)!;
export const workerOf = (id: string | null) => (id ? S.db.workers.find(w => w.id === id) : undefined);
export const stayLabel = (s: Stay) => workerOf(s.workerId)?.name ?? s.holdLabel ?? 'Name to follow';
export const roomLabel = (roomId: string) => { const r = roomOf(roomId); return `${propOf(r.propertyId).short} ${r.name}`; };

// Changeovers are PERSISTENT rows with stable ids. reconcile() only creates or updates them from stay boundaries
// and reports events; it never drops one that has been scheduled. (Mirrored in supabase/migrations/0002_rules.sql.)
export interface CoEvent { kind: 'created' | 'moved' | 'invalidated' | 'cancelled' | 'continues' | 'dropped'; co?: Changeover; roomId: string; text: string }
export function reconcile(x: DB): CoEvent[] {
  const ev: CoEvent[] = [];
  const seen = new Set<string>();
  for (const room of x.rooms) {
    const list = x.stays.filter(s => s.roomId === room.id).sort((a, b) => a.arrival.localeCompare(b.arrival));
    for (const s of list) {
      if (!s.departure || s.depStatus === 'tbc' || s.depStatus === 'ufn') continue;
      const next = list.find(n => n.id !== s.id && n.arrival >= s.departure!) ?? null;
      const continues = !!(next && next.workerId && next.workerId === s.workerId && next.arrival === s.departure);
      const co = x.changeovers.find(c => c.fromStayId === s.id);
      if (continues) { if (!co || co.status === 'needs') { if (co) seen.add(co.id); ev.push({ kind: 'continues', roomId: room.id, text: `${room.name}: same worker continues on ${s.departure}, no clean needed` }); continue; } }
      const readyBy = next ? next.arrival : null; const zeroDay = !!next && next.arrival === s.departure;
      if (!co) {
        const n: Changeover = { id: uid(), roomId: room.id, fromStayId: s.id, toStayId: next?.id ?? null, afterDate: s.departure, readyBy, status: 'needs', scheduledFor: null, cleanerId: null, note: '', vacated: false, zeroDay };
        x.changeovers.push(n); seen.add(n.id); ev.push({ kind: 'created', co: n, roomId: room.id, text: 'created' }); continue;
      }
      seen.add(co.id);
      const linkedDateChanged = co.afterDate !== s.departure || co.roomId !== room.id || (co.toStayId === (next?.id ?? null) && co.readyBy !== readyBy)
        || (co.toStayId !== (next?.id ?? null) && !!readyBy && !!co.scheduledFor && readyBy < co.scheduledFor);
      const moved = linkedDateChanged || co.readyBy !== readyBy;
      if (moved && !linkedDateChanged) { Object.assign(co, { readyBy, toStayId: next?.id ?? null, zeroDay }); ev.push({ kind: 'moved', co, roomId: room.id, text: `ready-by now ${readyBy ? fmt(readyBy) : 'open'}` }); }
      else if (moved) {
        const was = co.status;
        Object.assign(co, { roomId: room.id, afterDate: s.departure, readyBy, toStayId: next?.id ?? null, zeroDay, cancelled: undefined });
        if (was !== 'needs') { co.status = 'needs'; co.scheduledFor = null; co.vacated = false; co.invalidated = `Dates changed (was ${CO_LABEL[was]}) – needs rescheduling`; ev.push({ kind: 'invalidated', co, roomId: room.id, text: co.invalidated }); }
        else ev.push({ kind: 'moved', co, roomId: room.id, text: 'dates moved' });
      } else if (co.cancelled) { co.cancelled = undefined; }
      co.toStayId = next?.id ?? null;
    }
  }
  // changeovers whose departing stay vanished or became open-ended
  for (const c of [...x.changeovers]) {
    if (seen.has(c.id) || c.cancelled) continue;
    const scheduled = c.status !== 'needs' || c.scheduledFor || c.invalidated; // once scheduled, never silently dropped
    if (scheduled) { c.cancelled = 'Departure removed or made open-ended after this clean was scheduled'; ev.push({ kind: 'cancelled', co: c, roomId: c.roomId, text: c.cancelled }); }
    else { x.changeovers = x.changeovers.filter(z => z.id !== c.id); ev.push({ kind: 'dropped', roomId: c.roomId, text: 'unscheduled changeover no longer needed' }); }
  }
  return ev;
}
export const coBucket = (c: Changeover, today: string): CoStatus | 'later' | 'cancelled' =>
  c.cancelled ? 'cancelled' : c.status === 'needs' && !c.readyBy && c.afterDate > addDays(today, 7) ? 'later' : c.status;
export const coDepartText = (c: Changeover) => { const s = S.db.stays.find(x => x.id === c.fromStayId); return `Departs ${fmt(c.afterDate)} (${s?.depStatus === 'confirmed' ? 'confirmed' : 'planned'})`; };

export class ConflictError extends Error {}
export interface StayInput { id?: string; version?: number; roomId: string; workerId: string | null; holdLabel: string; arrival: string; departure: string | null; depStatus: DepStatus; away: { from: string; to: string } | null; notes: string }

export function validate(inp: StayInput): string | null {
  if (!inp.arrival) return 'Enter an arrival date.';
  if ((inp.depStatus === 'planned' || inp.depStatus === 'confirmed') && !inp.departure) return 'Enter a departure date, or choose Departure TBC / Until further notice.';
  if (inp.away) {
    if (!inp.away.from || !inp.away.to || inp.away.to <= inp.away.from) return 'Away dates: "back" must be after "leaves".';
    if (inp.away.from < inp.arrival || (inp.departure && inp.away.to > inp.departure)) return 'Away dates must fall inside the stay.';
  }
  if (inp.departure && inp.departure <= inp.arrival) return 'Departure must be after arrival (departure day is not a night).';
  const clash = S.db.stays.find(s => s.id !== inp.id && s.roomId === inp.roomId && overlaps(s.arrival, s.departure, inp.arrival, inp.departure));
  if (clash) return `Clashes with ${stayLabel(clash)} (${fmt(clash.arrival)} → ${clash.departure ? fmt(clash.departure) : 'open-ended'}) in ${roomLabel(inp.roomId)}.`;
  return null;
}

export function depText(s: Pick<Stay, 'departure' | 'depStatus'>) {
  if (s.depStatus === 'ufn') return 'Until further notice';
  if (s.depStatus === 'tbc') return 'Departure TBC';
  return s.departure ? `${fmt(s.departure)}${s.depStatus === 'confirmed' ? ' ✓' : ' (planned)'}` : 'Open';
}

// 7am digest text (per role)
export function digest(role: Role) {
  const T = londonToday();
  const visible = S.db.stays.filter(s => propOf(roomOf(s.roomId).propertyId).contracted);
  const dep = visible.filter(s => s.departure === T && s.depStatus !== 'tbc' && s.depStatus !== 'ufn');
  const arr = visible.filter(s => s.arrival === T);
  const cos = S.db.changeovers.filter(c => c.status !== 'ready' && !c.cancelled && (c.readyBy ?? c.afterDate) <= addDays(T, 7));
  const nm = (s: Stay) => role === 'cleaner' ? (stayLabel(s).split(' ')[0]) : stayLabel(s);
  return [
    `Good morning — ${fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}`,
    `Departures (${dep.length}): ` + (dep.map(s => `${roomLabel(s.roomId)} ${nm(s)}${s.depStatus === 'confirmed' ? '' : ' (planned, not confirmed)'}`).join('; ') || 'none'),
    `Arrivals (${arr.length}): ` + (arr.map(s => `${roomLabel(s.roomId)} ${nm(s)}`).join('; ') || 'none'),
    `Changeovers due in next 7 days (${cos.length}): ` + (cos.map(c => `${roomLabel(c.roomId)} ready by ${c.readyBy ? fmt(c.readyBy) : 'no arrival yet'} [${role === 'client' ? CO_CLIENT_LABEL[c.status] : CO_LABEL[c.status]}]`).join('; ') || 'none'),
    `In house tonight: ${visible.filter(s => s.arrival <= T && (s.departure ?? '9') > T && !(s.away && s.away.from <= T && s.away.to > T)).length}`,
  ].join('\n');
}

export const CO_LABEL: Record<CoStatus, string> = { needs: 'Needs scheduling', scheduled: 'Scheduled', in_progress: 'In progress', ready: 'Ready' };
export const CO_CLIENT_LABEL: Record<CoStatus, string> = { needs: 'Cleaning to be scheduled', scheduled: 'Cleaning scheduled', in_progress: 'Cleaning in progress', ready: 'Ready' };
export const bathText = (r: Room) => r.bath === 'ensuite' ? 'Ensuite' : r.bath === 'private' ? 'Private shower room' : 'Shared shower room';
