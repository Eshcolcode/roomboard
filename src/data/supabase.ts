// Supabase backend. Mirrors supabase/migrations/*.sql. Derived changeovers, activity log and the alert
// outbox are written by database triggers, so this file only reads tables and performs the user's writes.
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { S, publish, ConflictError } from './core';
import type { DB, Stay, Changeover, Worker, Series, StayInput } from './core';
import { reshape } from './crew';
import { londonToday } from '../dates';
import type { Repo } from './repo';
import type * as R from './db-rows';
import { unitIcs } from './extras';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
let channel: RealtimeChannel | null = null;
const empty = (): DB => ({
  v: 1,
  users: [],
  properties: [],
  units: [],
  rooms: [],
  workers: [],
  stays: [],
  changeovers: [],
  activity: [],
  alerts: [],
  enquiries: [],
  currentUser: '',
});

const mapStay = (r: R.StayRow): Stay => ({
  id: r.id,
  roomId: r.room_id,
  workerId: r.worker_id,
  holdLabel: r.hold_label ?? '',
  arrival: r.arrival,
  departure: r.departure,
  depStatus: r.dep_status,
  away: r.away_from && r.away_to ? { from: r.away_from, to: r.away_to } : null,
  notes: r.notes ?? '',
  version: r.version,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
  seriesId: r.series_id ?? null,
  slot: r.slot ?? null,
  request: r.request ?? null,
});
const mapSeries = (r: R.SeriesRow): Series => ({
  id: r.id,
  label: r.label,
  propertyId: r.property_id,
  start: r.start_date,
  on: r.on_days,
  off: r.off_days,
  offMode: r.off_mode,
  end:
    r.end_kind === 'date'
      ? { kind: 'date', date: r.end_date ?? r.start_date }
      : r.end_kind === 'cycles'
        ? { kind: 'cycles', n: r.cycles ?? 1 }
        : { kind: 'ufn' },
  horizon: r.horizon,
  slots: r.slots ?? [],
  cancelledFrom: r.cancelled_from,
  createdBy: r.created_by,
  createdAt: r.created_at,
});
const seriesRow = (s: Omit<Series, 'id' | 'createdBy' | 'createdAt'> & { id?: string }) => ({
  id: s.id,
  label: s.label,
  property_id: s.propertyId,
  start_date: s.start,
  on_days: s.on,
  off_days: s.off,
  off_mode: s.offMode,
  end_kind: s.end.kind,
  end_date: s.end.kind === 'date' ? s.end.date : null,
  cycles: s.end.kind === 'cycles' ? s.end.n : null,
  horizon: s.horizon ?? null,
  slots: s.slots,
  cancelled_from: s.cancelledFrom ?? null,
});
const createRow = (i: StayInput) => ({
  room_id: i.roomId,
  worker_id: i.workerId,
  hold_label: i.workerId ? null : i.holdLabel,
  arrival: i.arrival,
  departure: i.departure,
  away_from: i.away?.from ?? null,
  away_to: i.away?.to ?? null,
  notes: i.notes,
  slot: i.slot,
});
const mapCo = (r: R.ChangeoverRow): Changeover => ({
  id: r.id,
  roomId: r.room_id,
  fromStayId: r.from_stay_id,
  toStayId: r.to_stay_id,
  afterDate: r.after_date,
  readyBy: r.ready_by,
  status: r.status,
  scheduledFor: r.scheduled_for,
  cleanerId: r.cleaner_id,
  note: r.note ?? '',
  invalidated: r.invalidated_reason ?? undefined,
  vacated: r.vacated,
  zeroDay: r.zero_day,
  cancelled: r.cancelled_reason ?? undefined,
  exception: r.exception_reason ?? undefined,
});

const rows = <T>(d: unknown): T[] => (d ?? []) as T[];

async function refresh() {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    publish({ ...empty(), authRequired: true });
    return;
  }
  const q = (t: string, order = 'id') => sb.from(t).select('*').order(order);
  const [pr, pp, un, rm, wk, st, co, ac, al, en, se, fd, bl, tk] = await Promise.all([
    q('profiles'),
    q('properties', 'sort'),
    q('units', 'sort'),
    q('rooms', 'sort'),
    q('workers', 'name'),
    q('stays', 'arrival'),
    q('changeovers', 'after_date'),
    sb.from('activity').select('*').order('ts', { ascending: false }).limit(300),
    sb.from('alert_outbox').select('*').order('created_at', { ascending: false }).limit(50),
    q('enquiries', 'created_at'),
    q('series', 'created_at'),
    q('ical_feeds', 'label'), // manager only (RLS); others get an empty list
    q('ical_blocks', 'start_date'),
    // Sheena cannot read other guests' stays in the extras (0008 RLS): she gets their dates only
    sb.rpc('extra_taken'),
  ]);
  publish({
    v: 1,
    currentUser: user.id,
    users: rows<R.ProfileRow>(pr.data).map(r => ({
      id: r.id,
      name: r.full_name,
      role: r.role,
      email: r.email ?? '',
      phone: r.phone ?? '',
      smsOptIn: r.sms_opt_in,
      pushEnabled: r.push_enabled,
    })),
    properties: rows<R.PropertyRow>(pp.data).map(r => ({
      id: r.id,
      name: r.name,
      short: r.short_name,
      contracted: r.contracted,
      address: r.address ?? '',
      blurb: r.blurb ?? '',
      photo: r.photo_url ?? undefined,
      features: r.features ?? [],
      beds: r.beds_label ?? undefined,
      brand: r.brand ?? undefined,
      checkout: r.checkout_time?.slice(0, 5),
      checkin: r.checkin_time?.slice(0, 5),
      ...(r.details ?? {}),
    })),
    units: rows<R.UnitRow>(un.data).map(r => ({ id: r.id, propertyId: r.property_id, name: r.name })),
    rooms: rows<R.RoomRow>(rm.data).map(r => ({
      id: r.id,
      propertyId: r.property_id,
      unitId: r.unit_id,
      name: r.name,
      bath: r.bath,
      note: r.note ?? undefined,
      photo: r.photo_url ?? undefined,
      floor: r.floor ?? undefined,
      ...(r.details ?? {}),
    })),
    workers: rows<R.WorkerRow>(wk.data).map(r => ({
      id: r.id,
      name: r.name,
      company: r.company ?? '',
      phone: r.phone ?? '',
      notes: r.notes ?? '',
      lastUsed: r.last_used ?? undefined,
      uses: r.uses ?? 0,
    })),
    stays: rows<R.StayRow>(st.data).map(mapStay),
    changeovers: rows<R.ChangeoverRow>(co.data).map(mapCo),
    activity: rows<R.ActivityRow>(ac.data).map(r => ({
      id: r.id,
      ts: r.ts,
      userId: r.user_id,
      text: r.text,
      propertyId: r.property_id ?? undefined,
    })),
    alerts: rows<R.AlertRow>(al.data).map(r => ({
      id: r.id,
      ts: r.created_at,
      toUserId: r.recipient_id,
      channel: r.channel,
      to: r.recipient,
      subject: r.subject,
      body: r.body,
      status: r.status,
      attempts: r.attempts,
      nextAttemptAt: Date.parse(r.next_attempt_at),
    })),
    series: rows<R.SeriesRow>(se.data).map(mapSeries),
    feeds: rows<R.FeedRow>(fd.data).map(r => ({
      id: r.id,
      roomId: r.room_id,
      label: r.label,
      url: r.url,
      lastSync: r.last_synced_at,
      error: r.last_error,
    })),
    blocks: rows<R.BlockRow>(bl.data)
      .map(r => ({
        id: r.id,
        roomId: r.room_id,
        feedId: r.feed_id,
        from: r.start_date,
        to: r.end_date,
      }))
      .concat(
        rows<{ room_id: string; start_date: string; end_date: string }>(tk.data).map((r, i) => ({
          id: 'taken-' + i,
          roomId: r.room_id,
          feedId: 'taken',
          from: r.start_date,
          to: r.end_date,
        })),
      ),
    enquiries: rows<R.EnquiryRow>(en.data).map(r => ({
      id: r.id,
      ts: r.created_at,
      propertyId: r.property_id,
      from: r.date_from,
      to: r.date_to,
      longTerm: r.long_term,
      people: r.people,
      note: r.note ?? '',
      status: r.status,
    })),
  });
}
// Undo = inverse operation through the same rules (triggers re-run, alerts go out for the undo too).
type One = { kind: 'create'; id: string } | { kind: 'update' | 'delete'; before: Stay };
type Inverse = One | { kind: 'series'; id: string } | { kind: 'batch'; items: One[] };
const undoStack: Inverse[] = [];
const toRow = (
  i: Pick<Stay, 'roomId' | 'workerId' | 'holdLabel' | 'arrival' | 'departure' | 'depStatus' | 'away' | 'notes'>,
) => ({
  room_id: i.roomId,
  worker_id: i.workerId,
  hold_label: i.workerId ? null : i.holdLabel || 'Name to follow',
  arrival: i.arrival,
  departure: i.depStatus === 'tbc' || i.depStatus === 'ufn' ? null : i.departure,
  dep_status: i.depStatus,
  away_from: i.away?.from ?? null,
  away_to: i.away?.to ?? null,
  notes: i.notes,
  // a client's booking of an extra property is forced to a request by the stays_request trigger (0008)
  ...('request' in i ? { request: (i as { request?: 'pending' | null }).request ?? null } : {}),
});
const fail = (e: R.PgError | null | undefined) => {
  if (e?.code === '23P01') throw new Error('That room is already taken for some of those nights.');
  if (e?.code === 'P0001') throw new Error(e.message);
  if (e) throw new Error(e.message);
};

async function revert(u: One) {
  if (u.kind === 'create') fail((await sb.from('stays').delete().eq('id', u.id)).error);
  else if (u.kind === 'delete') fail((await sb.from('stays').insert({ id: u.before.id, ...toRow(u.before) })).error);
  else {
    const cur = S.db.stays.find(s => s.id === u.before.id);
    fail(
      (
        await sb
          .from('stays')
          .update({ ...toRow(u.before), version: cur?.version })
          .eq('id', u.before.id)
      ).error,
    );
  }
}

export const supabaseRepo: Repo = {
  mode: 'supabase',
  async init() {
    publish(empty());
    await refresh();
    sb.auth.onAuthStateChange(() => refresh());
    channel = sb
      .channel('board')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => refresh())
      .subscribe();
  },
  async saveStay(i) {
    const row = toRow(i);
    const before = i.id ? S.db.stays.find(s => s.id === i.id) : undefined;
    if (i.id) {
      // optimistic concurrency: only update if nobody bumped the version meanwhile
      // expected_version is checked by the stays_version trigger (raises 40001 on a stale edit)
      const { data, error } = await sb
        .from('stays')
        .update({ ...row, version: i.version })
        .eq('id', i.id)
        .select();
      if (error?.code === '40001')
        throw new ConflictError(
          'This stay was changed by someone else while you were editing. Reload to see the latest before saving.',
        );
      fail(error);
      if (!data?.length)
        throw new ConflictError(
          'This stay was changed by someone else while you were editing. Reload to see the latest before saving.',
        );
      if (before) undoStack.push({ kind: 'update', before: structuredClone(before) });
      await refresh();
      return mapStay(data[0]);
    }
    const { data, error } = await sb.from('stays').insert(row).select().single();
    fail(error);
    undoStack.push({ kind: 'create', id: data.id });
    await refresh();
    return mapStay(data);
  },
  async deleteStay(id) {
    const b = S.db.stays.find(s => s.id === id);
    fail((await sb.from('stays').delete().eq('id', id)).error);
    if (b) undoStack.push({ kind: 'delete', before: structuredClone(b) });
    await refresh();
  },
  async confirmDeparture(id) {
    fail((await sb.from('stays').update({ dep_status: 'confirmed' }).eq('id', id)).error);
    await refresh();
  },
  async updateChangeover(id, p) {
    const row: Record<string, unknown> = {};
    if (p.status !== undefined) row.status = p.status;
    if (p.scheduledFor !== undefined) row.scheduled_for = p.scheduledFor;
    if (p.cleanerId !== undefined) row.cleaner_id = p.cleanerId;
    if (p.vacated !== undefined) row.vacated = p.vacated;
    if (p.note !== undefined) row.note = p.note;
    if (p.exception !== undefined) row.exception_reason = p.exception;
    fail((await sb.from('changeovers').update(row).eq('id', id)).error);
    await refresh();
  },
  async dismissChangeover(id) {
    fail((await sb.rpc('dismiss_changeover', { co_id: id })).error);
    await refresh();
  },
  async updateProperty(id, p) {
    fail(
      (await sb.from('properties').update({ checkout_time: p.checkout, checkin_time: p.checkin }).eq('id', id)).error,
    );
    await refresh();
  },
  async setPrefs(id, p) {
    fail(
      (await sb.from('profiles').update({ sms_opt_in: p.smsOptIn, push_enabled: p.pushEnabled }).eq('id', id)).error,
    );
    await refresh();
  },
  async upsertWorker(w) {
    const row = { name: w.name, company: w.company, phone: w.phone, notes: w.notes };
    const r = w.id
      ? await sb.from('workers').update(row).eq('id', w.id).select().single()
      : await sb.from('workers').insert(row).select().single();
    fail(r.error);
    await refresh();
    return S.db.workers.find(x => x.id === r.data.id) as Worker;
  },
  async addEnquiry(e) {
    fail(
      (
        await sb.from('enquiries').insert({
          property_id: e.propertyId,
          date_from: e.from,
          date_to: e.to,
          long_term: e.longTerm,
          people: e.people,
          note: e.note,
        })
      ).error,
    );
    await refresh();
  },
  async createSeries(base, inputs) {
    const { data, error } = await sb.rpc('apply_series', {
      p_series: seriesRow(base),
      p_create: inputs.map(createRow),
      p_update: [],
      p_delete: [],
      p_what: 'booked',
    });
    fail(error);
    undoStack.push({ kind: 'series', id: data as string });
    await refresh();
    return S.db.series!.find(x => x.id === data)!;
  },
  async updateSeries(next, what) {
    const cur = S.db.series?.find(x => x.id === next.id);
    if (!cur) throw new Error('That crew booking no longer exists.');
    const r = reshape(S.db, cur, next, londonToday());
    fail(
      (
        await sb.rpc('apply_series', {
          p_series: seriesRow(next),
          p_create: r.create.map(createRow),
          p_update: r.update.map(u => ({
            id: u.id,
            version: u.version,
            departure: u.departure,
            away_from: u.away?.from ?? null,
            away_to: u.away?.to ?? null,
          })),
          p_delete: r.remove,
          p_what: what,
        })
      ).error,
    );
    await refresh();
  },
  async undo() {
    const u = undoStack.pop();
    if (!u) return;
    if (u.kind === 'series') {
      // undo a crew booking = remove the stays it generated (and the series row)
      fail((await sb.from('stays').delete().eq('series_id', u.id)).error);
      fail((await sb.from('series').delete().eq('id', u.id)).error);
      await refresh();
      return;
    }
    for (const one of u.kind === 'batch' ? [...u.items].reverse() : [u]) await revert(one);
    await refresh();
  },
  async saveBatch(inputs, removeIds, _what) {
    // Applied one row at a time through the same triggers; if one fails, the ones done are reverted.
    // (A single server-side transaction would need a new RPC; the database still refuses any clash.)
    const done: One[] = [];
    try {
      for (const id of removeIds) {
        const b = S.db.stays.find(s => s.id === id);
        fail((await sb.from('stays').delete().eq('id', id)).error);
        if (b) done.push({ kind: 'delete', before: structuredClone(b) });
      }
      for (const i of inputs) {
        if (i.id) {
          const b = S.db.stays.find(s => s.id === i.id);
          const { data, error } = await sb
            .from('stays')
            .update({ ...toRow(i), version: i.version })
            .eq('id', i.id)
            .select();
          fail(error);
          if (!data?.length)
            throw new ConflictError('One of these stays was changed by someone else. Reload and try again.');
          if (b) done.push({ kind: 'update', before: structuredClone(b) });
        } else {
          const { data, error } = await sb.from('stays').insert(toRow(i)).select().single();
          fail(error);
          done.push({ kind: 'create', id: data.id });
        }
      }
    } catch (e) {
      for (const one of done.reverse()) await revert(one).catch(() => undefined);
      await refresh();
      throw e;
    }
    undoStack.push({ kind: 'batch', items: done });
    await refresh();
  },
  async confirmRequest(id) {
    fail((await sb.rpc('answer_request', { p_stay: id, p_confirm: true, p_reason: '' })).error);
    await refresh();
  },
  async declineRequest(id, reason) {
    fail((await sb.rpc('answer_request', { p_stay: id, p_confirm: false, p_reason: reason })).error);
    await refresh();
  },
  async syncFeeds() {
    const { data, error } = await sb.functions.invoke('ical-sync', { body: {} });
    if (error) throw new Error('Could not read the calendar links right now. Try again in a minute.');
    await refresh();
    return { conflicts: (data as { conflicts?: number })?.conflicts ?? 0 };
  },
  async addFeed(f) {
    fail((await sb.from('ical_feeds').insert({ room_id: f.roomId, label: f.label, url: f.url })).error);
    await refresh();
  },
  async removeFeed(id) {
    fail((await sb.from('ical_feeds').delete().eq('id', id)).error);
    await refresh();
  },
  async exportLink(roomId) {
    const { data, error } = await sb.from('ical_exports').select('token').eq('room_id', roomId).maybeSingle();
    fail(error);
    const url = data ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-export?t=${data.token}` : null;
    return { url, text: unitIcs(S.db, roomId) };
  },
  canUndo: () => undoStack.length > 0,
  async setUser() {
    /* identity comes from login */
  },
  async reset() {
    await sb.auth.signOut();
    channel?.unsubscribe();
  },
  async signIn(email) {
    fail((await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } })).error);
  },
};
