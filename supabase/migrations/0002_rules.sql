-- Business rules. Mirrors src/data/core.ts reconcile() and src/data/local.ts (demo adapter) one-for-one.

create or replace function room_label(r text) returns text language sql stable as $$ select p.short_name || ' ' || rm.name from rooms rm join properties p on p.id = rm.property_id where rm.id = r $$;
create or replace function stay_label(s stays) returns text language sql stable as $$ select coalesce((select name from workers where id = s.worker_id), s.hold_label, 'Name to follow') $$;
create or replace function london_today() returns date language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;
create or replace function log_activity(r text, msg text, ent text default null, ent_id text default null) returns void language sql security definer set search_path = public as $$
  insert into activity (property_id, entity, entity_id, text) select property_id, ent, ent_id, msg from rooms where id = r $$;

-- ---------- alert routing ----------
-- One channel per user by default (email); SMS if opted in; push if enabled. Never the actor. Deduped per event.
create or replace function enqueue_user(p profiles, subj text, msg text, evt text) returns void language plpgsql security definer set search_path = public as $$
declare ch text; addr text;
begin
  if p.id is not distinct from auth.uid() then return; end if;
  foreach ch in array array['email'] || case when p.sms_opt_in then array['sms'] else '{}'::text[] end || case when p.push_enabled then array['push'] else '{}'::text[] end loop
    addr := case ch when 'email' then p.email when 'sms' then p.phone else 'app' end;
    insert into alert_outbox (recipient_id, recipient, channel, subject, body, status, dedupe_key)
    values (p.id, coalesce(addr, ''), ch, subj, msg, case when coalesce(addr, '') = '' then 'no_address' else 'queued' end, evt || ':' || p.id || ':' || ch)
    on conflict (dedupe_key) do nothing;
  end loop;
end $$;
create or replace function enqueue_role(r app_role, subj text, msg text, evt text) returns void language plpgsql security definer set search_path = public as $$
declare p profiles; begin for p in select * from profiles where role = r loop perform enqueue_user(p, subj, msg, evt); end loop; end $$;
-- stay changes: provider edits -> client; client edits -> provider
create or replace function alert_stay_change(subj text, msg text, evt text) returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() = 'client' then perform enqueue_role('manager', subj, msg, evt);
  elsif my_role() = 'manager' then perform enqueue_role('client', subj, msg, evt); end if;
end $$;
-- changeover events -> assigned cleaner (or all cleaners); optionally the provider too
create or replace function alert_changeover(c changeovers, subj text, msg text, evt text, also_provider boolean default false) returns void language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  for p in select * from profiles where role = 'cleaner' and (c.cleaner_id is null or id = c.cleaner_id) loop perform enqueue_user(p, subj, msg, evt); end loop;
  if also_provider then perform enqueue_role('manager', subj, msg, evt); end if;
end $$;

-- ---------- stays: clash check + stale-edit check ----------
create or replace function stays_before() returns trigger language plpgsql as $$
declare c record; e text;
begin
  if tg_op = 'UPDATE' then
    if new.version is distinct from old.version then
      raise exception 'This stay was changed by someone else while you were editing' using errcode = '40001';
    end if;
    new.version := old.version + 1; new.updated_at := now(); new.updated_by := auth.uid();
  end if;
  if new.dep_status in ('tbc','ufn') then new.departure := null; end if;
  -- shared rule function (0006), tested against rules/cases.json
  e := rb_stay_error(new.arrival, new.departure, new.dep_status::text, new.away_from, new.away_to);
  if e in ('away_order', 'away_outside') then
    raise exception 'Away dates must fall inside the stay, and "back" must be after "leaves"' using errcode = 'P0001';
  elsif e is not null then raise exception 'Invalid stay: %', e using errcode = 'P0001'; end if;
  -- friendly clash message (the exclusion constraint is the hard guarantee, including under concurrency)
  select s.*, stay_label(s) lbl into c from stays s where s.room_id = new.room_id and s.id <> new.id
    and rb_overlaps(s.arrival, s.departure, new.arrival, new.departure) limit 1;
  if found then raise exception 'Clashes with % (% → %) in %', c.lbl, c.arrival, coalesce(c.departure::text, 'open-ended'), room_label(new.room_id) using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger stays_before before insert or update on stays for each row execute function stays_before();

-- ---------- changeovers: persistent, never silently dropped once scheduled ----------
create or replace function reconcile_room(r text) returns void language plpgsql security definer set search_path = public as $$
declare s stays; nxt stays; co changeovers; v_ready date; v_zero boolean; linked boolean; seen uuid[] := '{}';
begin
  for s in select * from stays where room_id = r and departure is not null and dep_status in ('planned','confirmed') order by arrival loop
    nxt := null; select * into nxt from stays where room_id = r and id <> s.id and arrival >= s.departure order by arrival limit 1;
    select * into co from changeovers where from_stay_id = s.id;
    if rb_boundary(s.worker_id, s.departure, s.dep_status::text, nxt.worker_id, nxt.arrival) = 'continues' and (co.id is null or co.status = 'needs') then
      if co.id is not null then seen := seen || co.id; end if;
      perform log_activity(r, room_label(r) || ': same worker continues, no clean needed', 'stay', s.id::text);
      continue;
    end if;
    v_ready := nxt.arrival; v_zero := rb_boundary(s.worker_id, s.departure, s.dep_status::text, nxt.worker_id, nxt.arrival) = 'zero_day';
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
  perform alert_stay_change(subj, msg, 'stay:' || st.id || ':' || coalesce(new.version, 0) || ':' || tg_op);
  return null;
end $$;
create trigger stays_after after insert or update or delete on stays for each row execute function stays_after();

-- ---------- changeover status flow: departure → (vacated) → clean → ready, all before next arrival ----------
create or replace function co_before() returns trigger language plpgsql security definer set search_path = public as $$
declare today date := london_today();
begin
  if new.scheduled_for is distinct from old.scheduled_for and new.scheduled_for is not null then
    if rb_clean_window(new.after_date, new.ready_by, new.scheduled_for) is not null then
      if new.exception_reason is null or my_role() <> 'manager' then
        raise exception 'Clean date must be between the departure (%) and the next arrival (%)', new.after_date, coalesce(new.ready_by::text, '—') using errcode = 'P0001';
      end if;
      perform log_activity(new.room_id, '⚠ Provider exception on ' || room_label(new.room_id) || ': ' || new.exception_reason, 'changeover', new.id::text);
    else new.exception_reason := null; end if;
  end if;
  if new.vacated and not old.vacated then
    if rb_status_gate('vacated', true, today, new.after_date) is not null then raise exception 'Cannot record vacated before the departure date (%)', new.after_date using errcode = 'P0001'; end if;
    new.vacated_at := now(); perform log_activity(new.room_id, room_label(new.room_id) || ': guest confirmed vacated', 'changeover', new.id::text);
  end if;
  if new.status = 'in_progress' and old.status <> 'in_progress' and rb_status_gate('in_progress', new.vacated, today, new.after_date) is not null then raise exception 'Record the actual departure (vacated) before starting the clean' using errcode = 'P0001'; end if;
  if new.status = 'ready' and old.status <> 'ready' then
    if rb_status_gate('ready', new.vacated, today, new.after_date) is not null then raise exception 'Ready needs a recorded actual departure (vacated)' using errcode = 'P0001'; end if;
    new.exception_reason := null;
  end if;
  if new.status is distinct from old.status then
    if new.status <> 'needs' then new.invalidated_reason := null; end if; new.updated_at := now();
    perform log_activity(new.room_id, 'Changeover ' || room_label(new.room_id) || ' → ' || new.status, 'changeover', new.id::text);
    if new.status = 'ready' then perform enqueue_role('client', room_label(new.room_id) || ' is ready', room_label(new.room_id) || ' is ready for the next arrival', 'ready:' || new.id);
    elsif new.status = 'scheduled' then perform alert_changeover(new, 'Clean scheduled · ' || room_label(new.room_id), 'Scheduled ' || new.scheduled_for, 'sch:' || new.id || ':' || new.scheduled_for); end if;
  elsif new.scheduled_for is distinct from old.scheduled_for and new.status = 'scheduled' then
    perform alert_changeover(new, 'Clean rescheduled · ' || room_label(new.room_id), 'Now ' || new.scheduled_for, 'sch:' || new.id || ':' || new.scheduled_for);
  end if;
  return new;
end $$;
create trigger co_before before update on changeovers for each row execute function co_before();

create or replace function dismiss_changeover(co_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare c changeovers;
begin
  if my_role() <> 'manager' then raise exception 'Only the provider can dismiss' using errcode = '42501'; end if;
  select * into c from changeovers where id = co_id; if not found then return; end if;
  delete from changeovers where id = co_id;
  perform log_activity(c.room_id, 'Dismissed flagged changeover ' || room_label(c.room_id), 'changeover', co_id::text);
  perform alert_changeover(c, 'Clean cancelled · ' || room_label(c.room_id), 'No longer needed', 'dis:' || co_id);
end $$;

create or replace function enquiry_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date_to is not null and new.date_to <= new.date_from then raise exception 'End date must be after start date' using errcode = 'P0001'; end if;
  perform enqueue_role('manager', 'New accommodation request', (select name from properties where id = new.property_id) || ' · ' || new.people || ' people from ' || new.date_from, 'enq:' || new.id);
  insert into activity (property_id, entity, entity_id, text) values (new.property_id, 'enquiry', new.id::text, 'Enquiry for ' || (select name from properties where id = new.property_id)); return null;
end $$;
create trigger enquiry_after after insert on enquiries for each row execute function enquiry_after();
alter table enquiries add constraint people_range check (people between 1 and 50);
