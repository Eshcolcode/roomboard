-- Crew bookings with rotations (v2). A series groups the stays it generated (stays.series_id + slot).
-- Rules are unchanged except boundary(): two back-to-back stays of the same series slot "continue" (no clean)
-- even while the slot is an unnamed hold. The rotation generator rb_rotation() mirrors src/data/rotation.ts
-- and both are tested against rules/cases.json.

create table if not exists series (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  property_id text not null references properties,
  start_date date not null,
  on_days int not null check (on_days >= 1),
  off_days int not null check (off_days >= 0),
  off_mode text not null default 'keep' check (off_mode in ('keep', 'release')),
  end_kind text not null check (end_kind in ('date', 'ufn', 'cycles')),
  end_date date, cycles int, horizon date,
  slots jsonb not null default '[]',             -- [{slot, workerId, label}]
  cancelled_from date,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);
alter table stays add column if not exists series_id uuid references series on delete set null;
alter table stays add column if not exists slot int;
create index if not exists stays_series on stays(series_id, slot, arrival);
alter table series enable row level security;
create policy "series read" on series for select using (auth.uid() is not null);
create policy "series write" on series for all using (my_role() in ('manager', 'client')) with check (my_role() in ('manager', 'client'));
alter publication supabase_realtime add table series;

create or replace function rb_slot(s stays) returns text language sql immutable as $$
  select case when s.series_id is not null and s.slot is not null then s.series_id::text || ':' || s.slot end $$;

create or replace function rb_boundary(dep_worker uuid, departure date, dep_status text, next_worker uuid, next_arrival date, dep_slot text, next_slot text)
returns text language sql immutable as $$
  select case
    when departure is null or dep_status in ('tbc', 'ufn') then 'open'
    when next_arrival = departure and next_worker is not null and next_worker = dep_worker then 'continues'
    when next_arrival = departure and dep_slot is not null and dep_slot = next_slot then 'continues'
    when next_arrival = departure then 'zero_day'
    else 'changeover' end $$;

-- Rotation generator: see src/data/rotation.ts for the meaning of keep / release.
create or replace function rb_rotation(p_start date, p_on int, p_off int, p_end_kind text, p_end_date date, p_cycles int, p_off_mode text, p_horizon date default null)
returns table(arrival date, departure date, away_from date, away_to date) language plpgsql immutable as $$
declare k int := 0; cyc int := p_on + p_off; stop date; maxn int; arr date; nxt date; blk date; last boolean;
begin
  if p_start is null or p_on < 1 or p_off < 0 then return; end if;
  stop := case p_end_kind when 'date' then p_end_date when 'ufn' then coalesce(p_horizon, p_start + 84) end;
  maxn := case when p_end_kind = 'cycles' then least(p_cycles, 60) else 60 end;
  while k < maxn loop
    arr := p_start + k * cyc;
    exit when stop is not null and arr >= stop;
    nxt := arr + cyc;
    last := k + 1 >= maxn or (stop is not null and nxt >= stop);
    blk := arr + p_on;
    if p_end_kind = 'date' and blk > p_end_date then blk := p_end_date; end if;
    arrival := arr;
    if p_off_mode = 'keep' and not last and p_off > 0 then
      departure := nxt; away_from := blk; away_to := nxt;
    else
      departure := blk; away_from := null; away_to := null;
    end if;
    return next; k := k + 1;
  end loop;
end $$;

create or replace function reconcile_room(r text) returns void language plpgsql security definer set search_path = public as $$
declare s stays; nxt stays; co changeovers; v_ready date; v_zero boolean; linked boolean; seen uuid[] := '{}';
begin
  for s in select * from stays where room_id = r and departure is not null and dep_status in ('planned','confirmed') order by arrival loop
    nxt := null; select * into nxt from stays where room_id = r and id <> s.id and arrival >= s.departure order by arrival limit 1;
    select * into co from changeovers where from_stay_id = s.id;
    if rb_boundary(s.worker_id, s.departure, s.dep_status::text, nxt.worker_id, nxt.arrival, rb_slot(s), rb_slot(nxt)) = 'continues' and (co.id is null or co.status = 'needs') then
      -- not marked seen: an unbooked clean is deleted below, a re-flagged one is kept and flagged
      perform log_activity(r, room_label(r) || ': same worker continues, no clean needed', 'stay', s.id::text);
      continue;
    end if;
    v_ready := nxt.arrival; v_zero := rb_boundary(s.worker_id, s.departure, s.dep_status::text, nxt.worker_id, nxt.arrival, rb_slot(s), rb_slot(nxt)) = 'zero_day';
    if co.id is null then
      insert into changeovers (room_id, from_stay_id, to_stay_id, after_date, ready_by, zero_day) values (r, s.id, nxt.id, s.departure, v_ready, v_zero) returning * into co;
      if v_zero then perform log_activity(r, '⚠ ' || room_label(r) || ': same-day changeover on ' || s.departure, 'changeover', co.id::text); end if;
      seen := seen || co.id; continue;
    end if;
    seen := seen || co.id;
    linked := co.after_date <> s.departure or co.room_id <> r or (co.to_stay_id is not distinct from nxt.id and co.ready_by is distinct from v_ready)
      or (co.to_stay_id is distinct from nxt.id and v_ready is not null and co.scheduled_for is not null and v_ready < co.scheduled_for);
    if linked and co.status <> 'needs' then
      update changeovers set room_id = r, after_date = s.departure, ready_by = v_ready, to_stay_id = nxt.id, zero_day = v_zero, status = 'needs', scheduled_for = null, vacated = false, cancelled_reason = null,
        invalidated_reason = 'Dates changed (was ' || co.status || ') – needs rescheduling', updated_at = now() where id = co.id returning * into co;
      perform log_activity(r, '⚠ Changeover ' || room_label(r) || ' needs rescheduling: dates changed', 'changeover', co.id::text);
      perform alert_changeover(co, '⚠ ' || room_label(r) || ' changeover needs rescheduling', co.invalidated_reason, 'inv:' || co.id || ':' || extract(epoch from now())::bigint, true);
    elsif co.ready_by is distinct from v_ready or co.after_date <> s.departure then
      update changeovers set after_date = s.departure, ready_by = v_ready, to_stay_id = nxt.id, zero_day = v_zero, updated_at = now() where id = co.id returning * into co;
      perform log_activity(r, 'Changeover ' || room_label(r) || ': ready-by now ' || coalesce(v_ready::text, 'open'), 'changeover', co.id::text);
      if co.status <> 'needs' then perform alert_changeover(co, room_label(r) || ' ready-by moved', 'Ready by ' || coalesce(v_ready::text, 'open'), 'rb:' || co.id || ':' || coalesce(v_ready::text, 'open')); end if;
    else
      update changeovers set to_stay_id = nxt.id, cancelled_reason = null where id = co.id;
    end if;
  end loop;
  -- departing stay gone or open-ended: unscheduled rows go; scheduled rows are KEPT and flagged
  for co in select * from changeovers where room_id = r and not (id = any(seen)) and cancelled_reason is null loop
    if co.status = 'needs' and co.scheduled_for is null and co.invalidated_reason is null then delete from changeovers where id = co.id;
    else
      update changeovers set cancelled_reason = 'Departure removed or made open-ended after this clean was scheduled' where id = co.id returning * into co;
      perform log_activity(r, '⚠ Changeover ' || room_label(r) || ' kept but flagged: departure removed after it was scheduled', 'changeover', co.id::text);
      perform alert_changeover(co, '⚠ ' || room_label(r) || ' changeover may not be needed', co.cancelled_reason, 'cx:' || co.id, true);
    end if;
  end loop;
end $$;

create or replace function stays_after() returns trigger language plpgsql security definer set search_path = public as $$
declare st stays := coalesce(new, old); msg text; subj text;
begin
  perform reconcile_room(st.room_id);
  if tg_op = 'UPDATE' and old.room_id <> new.room_id then perform reconcile_room(old.room_id); end if;
  if tg_op = 'INSERT' then
    msg := (case when new.worker_id is null then 'Held ' else 'Booked ' end) || room_label(new.room_id) || ' for ' || stay_label(new) || ' from ' || to_char(new.arrival, 'Dy DD Mon');
    subj := case when new.worker_id is null then 'Room held · ' else 'New arrival · ' end || room_label(new.room_id);
  elsif tg_op = 'DELETE' then
    msg := 'Cancelled ' || stay_label(old) || ' · ' || room_label(old.room_id); subj := 'Stay cancelled · ' || room_label(old.room_id);
  else
    if old.dep_status <> 'confirmed' and new.dep_status = 'confirmed' and old.departure is not distinct from new.departure then
      msg := 'Confirmed departure of ' || stay_label(new) || ' · ' || room_label(new.room_id) || ' on ' || new.departure; subj := 'Departure confirmed · ' || room_label(new.room_id);
    else
      msg := room_label(new.room_id) || ' · ' || stay_label(new) || ': ' || concat_ws(', ',
        case when old.worker_id is null and new.worker_id is not null then 'named hold as ' || stay_label(new) when old.worker_id is distinct from new.worker_id then 'changed guest' end,
        case when old.room_id <> new.room_id then 'moved room' end,
        case when old.arrival <> new.arrival then 'arrival ' || old.arrival || ' → ' || new.arrival end,
        case when old.departure is distinct from new.departure or old.dep_status <> new.dep_status then 'departure ' || coalesce(new.departure::text, new.dep_status::text) end,
        case when old.away_from is distinct from new.away_from or old.away_to is distinct from new.away_to then 'away dates' end,
        case when old.notes is distinct from new.notes then 'notes updated' end);
      subj := 'Stay updated · ' || room_label(new.room_id);
    end if;
  end if;
  perform log_activity(st.room_id, msg, 'stay', st.id::text);
  -- a crew booking sends ONE summary alert from apply_series(), not one per generated stay
  if coalesce(current_setting('rb.bulk', true), '') = 'on' then return null; end if;
  perform alert_stay_change(subj, msg, 'stay:' || st.id || ':' || coalesce(new.version, 0) || ':' || tg_op);
  return null;
end $$;

-- One atomic crew command: upsert the series, then delete / update / insert its stays. Any clash raises and
-- the whole thing rolls back. Runs as the caller, so the stays RLS policies still apply.
create or replace function apply_series(p_series jsonb, p_create jsonb, p_update jsonb, p_delete uuid[], p_what text)
returns uuid language plpgsql set search_path = public as $$
declare sid uuid; u jsonb; n_c int := 0; n_u int := 0; n_d int := 0; msg text; lbl text;
begin
  insert into series (id, label, property_id, start_date, on_days, off_days, off_mode, end_kind, end_date, cycles, horizon, slots, cancelled_from)
  values (coalesce((p_series->>'id')::uuid, gen_random_uuid()), p_series->>'label', p_series->>'property_id', (p_series->>'start_date')::date,
    (p_series->>'on_days')::int, (p_series->>'off_days')::int, p_series->>'off_mode', p_series->>'end_kind', (p_series->>'end_date')::date,
    (p_series->>'cycles')::int, (p_series->>'horizon')::date, coalesce(p_series->'slots', '[]'), (p_series->>'cancelled_from')::date)
  on conflict (id) do update set label = excluded.label, end_kind = excluded.end_kind, end_date = excluded.end_date, cycles = excluded.cycles,
    horizon = excluded.horizon, slots = excluded.slots, cancelled_from = excluded.cancelled_from
  returning id, label into sid, lbl;
  perform set_config('rb.bulk', 'on', true);
  delete from stays where id = any(coalesce(p_delete, '{}')) and series_id = sid;
  get diagnostics n_d = row_count;
  for u in select * from jsonb_array_elements(coalesce(p_update, '[]')) loop
    update stays set departure = (u->>'departure')::date, away_from = (u->>'away_from')::date, away_to = (u->>'away_to')::date,
      version = (u->>'version')::int where id = (u->>'id')::uuid and series_id = sid;
    n_u := n_u + 1;
  end loop;
  insert into stays (room_id, worker_id, hold_label, arrival, departure, dep_status, away_from, away_to, notes, series_id, slot)
  select x.room_id, x.worker_id, case when x.worker_id is null then coalesce(x.hold_label, 'Name TBC') end, x.arrival, x.departure,
    'planned', x.away_from, x.away_to, x.notes, sid, x.slot
  from jsonb_to_recordset(coalesce(p_create, '[]')) as x(room_id text, worker_id uuid, hold_label text, arrival date, departure date,
    away_from date, away_to date, notes text, slot int);
  get diagnostics n_c = row_count;
  perform set_config('rb.bulk', 'off', true);
  msg := 'Crew ' || lbl || ': ' || p_what || ' (' || n_c || ' added, ' || n_u || ' changed, ' || n_d || ' removed)';
  perform log_activity((select room_id from stays where series_id = sid limit 1), msg, 'series', sid::text);
  perform alert_stay_change('Crew booking · ' || lbl, msg, 'series:' || sid || ':' || extract(epoch from clock_timestamp())::bigint);
  return sid;
end $$;
