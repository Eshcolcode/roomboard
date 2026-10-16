// Shared model + pure rules. Both data backends (local demo, Supabase) fill the same snapshot shape.
import { useSyncExternalStore } from 'react';
import { addDays, londonToday, overlaps, diffDays, fmt } from '../dates';
export type Role = 'client' | 'manager' | 'cleaner';
export type Bath = 'ensuite' | 'private' | 'shared';
export interface User { id: string; name: string; role: Role; email: string; phone: string }
export interface Property { id: string; name: string; short: string; contracted: boolean; address: string; blurb: string; photo?: string; features: string[]; beds?: string; brand?: string }
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
export interface Changeover { id: string; roomId: string; fromStayId: string | null; toStayId: string | null; afterDate: string; readyBy: string | null; status: CoStatus; scheduledFor: string | null; cleanerId: string | null; note: string; invalidated?: string }
export interface Activity { id: string; ts: string; userId: string; text: string; propertyId?: string }
export interface Alert { id: string; ts: string; channel: 'email' | 'sms' | 'push'; to: string; subject: string; body: string; status: 'queued' | 'sent' | 'failed'; attempts: number; nextAttemptAt: number }
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

export // Changeovers are derived from stay boundaries in each room, but their status is kept separately (readiness ≠ stay).
function reconcile(x: DB) {
  const T = londonToday();
  const keep: Changeover[] = [];
  for (const room of x.rooms) {
    const list = x.stays.filter(s => s.roomId === room.id).sort((a, b) => a.arrival.localeCompare(b.arrival));
    for (let i = 0; i < list.length; i++) {
      const s = list[i]; if (!s.departure || s.depStatus === 'tbc' || s.depStatus === 'ufn') continue;
      if (s.departure < addDays(T, -2)) continue;
      const next = list[i + 1] ?? null;
      // A planned "back-to-back" re-stay by the same worker (rotation) with no gap is a stayover, not a clean.
      if (next && next.workerId && next.workerId === s.workerId && next.arrival === s.departure) continue;
      let co = x.changeovers.find(c => c.fromStayId === s.id) ?? x.changeovers.find(c => c.roomId === room.id && c.afterDate === s.departure && !c.fromStayId);
      const readyBy = next ? next.arrival : null;
      if (!co) co = { id: uid(), roomId: room.id, fromStayId: s.id, toStayId: next?.id ?? null, afterDate: s.departure, readyBy, status: 'needs', scheduledFor: null, cleanerId: null, note: '' };
      else {
        const moved = co.afterDate !== s.departure || (readyBy !== null && co.readyBy !== null && readyBy < co.readyBy);
        if (moved && co.status !== 'needs') { co.invalidated = `Dates changed (${co.status === 'ready' ? 'was Ready' : 'was ' + co.status}) – needs rescheduling`; co.status = 'needs'; co.scheduledFor = null; }
        co = { ...co, afterDate: s.departure, readyBy, toStayId: next?.id ?? null };
      }
      keep.push(co);
    }
  }
  x.changeovers = keep;
}

// ---------------- commands ----------------
export class ConflictError extends Error {}
export interface StayInput { id?: string; version?: number; roomId: string; workerId: string | null; holdLabel: string; arrival: string; departure: string | null; depStatus: DepStatus; away: { from: string; to: string } | null; notes: string }

export function validate(inp: StayInput): string | null {
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
  const cos = S.db.changeovers.filter(c => c.status !== 'ready');
  const nm = (s: Stay) => role === 'cleaner' ? (stayLabel(s).split(' ')[0]) : stayLabel(s);
  return [
    `Good morning — ${fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}`,
    `Departures (${dep.length}): ` + (dep.map(s => `${roomLabel(s.roomId)} ${nm(s)}${s.depStatus === 'confirmed' ? '' : ' (planned, not confirmed)'}`).join('; ') || 'none'),
    `Arrivals (${arr.length}): ` + (arr.map(s => `${roomLabel(s.roomId)} ${nm(s)}`).join('; ') || 'none'),
    `Changeovers open (${cos.length}): ` + (cos.map(c => `${roomLabel(c.roomId)} ready by ${c.readyBy ? fmt(c.readyBy) : 'no arrival yet'} [${c.status}]`).join('; ') || 'none'),
    `In house tonight: ${visible.filter(s => s.arrival <= T && (s.departure ?? '9') > T && !(s.away && s.away.from <= T && s.away.to > T)).length}`,
  ].join('\n');
}

export const CO_LABEL: Record<CoStatus, string> = { needs: 'Needs scheduling', scheduled: 'Scheduled', in_progress: 'In progress', ready: 'Ready' };
export const CO_CLIENT_LABEL: Record<CoStatus, string> = { needs: 'Cleaning to be scheduled', scheduled: 'Cleaning scheduled', in_progress: 'Cleaning in progress', ready: 'Ready' };
export const bathText = (r: Room) => r.bath === 'ensuite' ? 'Ensuite' : r.bath === 'private' ? 'Private shower room' : 'Shared shower room';
