// Supabase backend. Mirrors supabase/migrations/*.sql. Derived changeovers, activity log and the alert
// outbox are written by database triggers, so this file only reads tables and performs the user's writes.
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { S, publish, ConflictError } from './core';
import type { DB, Stay, Changeover, Worker } from './core';
import type { Repo } from './repo';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
let channel: RealtimeChannel | null = null;
const empty = (): DB => ({ v: 1, users: [], properties: [], units: [], rooms: [], workers: [], stays: [], changeovers: [], activity: [], alerts: [], enquiries: [], currentUser: '' });

const mapStay = (r: any): Stay => ({ id: r.id, roomId: r.room_id, workerId: r.worker_id, holdLabel: r.hold_label ?? '', arrival: r.arrival, departure: r.departure, depStatus: r.dep_status,
  away: r.away_from ? { from: r.away_from, to: r.away_to } : null, notes: r.notes ?? '', version: r.version, updatedBy: r.updated_by, updatedAt: r.updated_at });
const mapCo = (r: any): Changeover => ({ id: r.id, roomId: r.room_id, fromStayId: r.from_stay_id, toStayId: r.to_stay_id, afterDate: r.after_date, readyBy: r.ready_by, status: r.status,
  scheduledFor: r.scheduled_for, cleanerId: r.cleaner_id, note: r.note ?? '', invalidated: r.invalidated_reason ?? undefined });

async function refresh() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { publish({ ...empty(), authRequired: true }); return; }
  const q = (t: string, order = 'id') => sb.from(t).select('*').order(order);
  const [pr, pp, un, rm, wk, st, co, ac, al, en] = await Promise.all([q('profiles'), q('properties', 'sort'), q('units', 'sort'), q('rooms', 'sort'), q('workers', 'name'), q('stays', 'arrival'), q('changeovers', 'after_date'),
    sb.from('activity').select('*').order('ts', { ascending: false }).limit(300), sb.from('alert_outbox').select('*').order('created_at', { ascending: false }).limit(50), q('enquiries', 'created_at')]);
  publish({
    v: 1, currentUser: user.id,
    users: (pr.data ?? []).map((r: any) => ({ id: r.id, name: r.full_name, role: r.role, email: r.email, phone: r.phone ?? '' })),
    properties: (pp.data ?? []).map((r: any) => ({ id: r.id, name: r.name, short: r.short_name, contracted: r.contracted, address: r.address ?? '', blurb: r.blurb ?? '', photo: r.photo_url ?? undefined, features: r.features ?? [], beds: r.beds_label ?? undefined, brand: r.brand ?? undefined })),
    units: (un.data ?? []).map((r: any) => ({ id: r.id, propertyId: r.property_id, name: r.name })),
    rooms: (rm.data ?? []).map((r: any) => ({ id: r.id, propertyId: r.property_id, unitId: r.unit_id, name: r.name, bath: r.bath, note: r.note ?? undefined, photo: r.photo_url ?? undefined, floor: r.floor ?? undefined })),
    workers: (wk.data ?? []).map((r: any) => ({ id: r.id, name: r.name, company: r.company ?? '', phone: r.phone ?? '', notes: r.notes ?? '', lastUsed: r.last_used ?? undefined, uses: r.uses ?? 0 })),
    stays: (st.data ?? []).map(mapStay), changeovers: (co.data ?? []).map(mapCo),
    activity: (ac.data ?? []).map((r: any) => ({ id: r.id, ts: r.ts, userId: r.user_id, text: r.text, propertyId: r.property_id })),
    alerts: (al.data ?? []).map((r: any) => ({ id: r.id, ts: r.created_at, channel: r.channel, to: r.recipient, subject: r.subject, body: r.body, status: r.status, attempts: r.attempts, nextAttemptAt: Date.parse(r.next_attempt_at) })),
    enquiries: (en.data ?? []).map((r: any) => ({ id: r.id, ts: r.created_at, propertyId: r.property_id, from: r.date_from, to: r.date_to, longTerm: r.long_term, people: r.people, note: r.note ?? '', status: r.status })),
  });
}
const fail = (e: any) => { if (e?.code === '23P01') throw new Error('That room is already taken for some of those nights.'); if (e) throw new Error(e.message); };

export const supabaseRepo: Repo = {
  mode: 'supabase',
  async init() {
    publish(empty()); await refresh();
    sb.auth.onAuthStateChange(() => refresh());
    channel = sb.channel('board').on('postgres_changes', { event: '*', schema: 'public' }, () => refresh()).subscribe();
  },
  async saveStay(i) {
    const row = { room_id: i.roomId, worker_id: i.workerId, hold_label: i.workerId ? null : i.holdLabel || 'Name to follow', arrival: i.arrival,
      departure: i.depStatus === 'tbc' || i.depStatus === 'ufn' ? null : i.departure, dep_status: i.depStatus, away_from: i.away?.from ?? null, away_to: i.away?.to ?? null, notes: i.notes };
    if (i.id) {
      // optimistic concurrency: only update if nobody bumped the version meanwhile
      const { data, error } = await sb.from('stays').update(row).eq('id', i.id).eq('version', i.version!).select(); fail(error);
      if (!data?.length) throw new ConflictError('This stay was changed by someone else while you were editing. Reload to see the latest before saving.');
      await refresh(); return mapStay(data[0]);
    }
    const { data, error } = await sb.from('stays').insert(row).select().single(); fail(error); await refresh(); return mapStay(data);
  },
  async deleteStay(id) { fail((await sb.from('stays').delete().eq('id', id)).error); await refresh(); },
  async confirmDeparture(id) { fail((await sb.from('stays').update({ dep_status: 'confirmed' }).eq('id', id)).error); await refresh(); },
  async updateChangeover(id, p) {
    fail((await sb.from('changeovers').update({ status: p.status, scheduled_for: p.scheduledFor, cleaner_id: p.cleanerId, note: p.note }).eq('id', id)).error); await refresh();
  },
  async upsertWorker(w) {
    const row = { name: w.name, company: w.company, phone: w.phone, notes: w.notes };
    const r = w.id ? await sb.from('workers').update(row).eq('id', w.id).select().single() : await sb.from('workers').insert(row).select().single(); fail(r.error);
    await refresh(); return S.db.workers.find(x => x.id === r.data.id) as Worker;
  },
  async addEnquiry(e) { fail((await sb.from('enquiries').insert({ property_id: e.propertyId, date_from: e.from, date_to: e.to, long_term: e.longTerm, people: e.people, note: e.note })).error); await refresh(); },
  async setUser() { /* identity comes from login */ },
  async reset() { await sb.auth.signOut(); channel?.unsubscribe(); },
  async signIn(email) { fail((await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } })).error); },
};
