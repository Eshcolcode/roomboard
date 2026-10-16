-- Business rules as triggers: version bump, changeover derivation and invalidation, activity log and alert queue.
create or replace function bump_version() returns trigger language plpgsql as $$
begin new.version := old.version + 1; new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger stays_version before update on stays for each row execute function bump_version();

create or replace function room_label(r text) returns text language sql stable as $$ select p.short_name || ' ' || rm.name from rooms rm join properties p on p.id = rm.property_id where rm.id = r $$;
create or replace function stay_label(s stays) returns text language sql stable as $$ select coalesce((select name from workers where id = s.worker_id), s.hold_label, 'Name to follow') $$;

-- queue an alert for every profile of the given roles (except the actor). SMS only when urgent.
create or replace function enqueue(roles app_role[], subj text, msg text, urgent boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into alert_outbox (recipient_id, recipient, channel, subject, body)
  select p.id, case c when 'sms' then p.phone else p.email end, c, subj, msg
  from profiles p cross join unnest(case when urgent then array['push','email','sms'] else array['push','email'] end) c
  where p.role = any(roles) and p.id is distinct from auth.uid() and (c <> 'sms' or p.phone is not null);
end $$;

-- Rebuild the changeovers of one room from its stays (same logic as reconcile() in core.ts).
create or replace function reconcile_room(r text) returns void language plpgsql security definer set search_path = public as $$
declare s record; nxt stays; co changeovers;
begin
  for s in select * from stays where room_id = r and departure is not null and dep_status in ('planned','confirmed') order by arrival loop
    select * into nxt from stays where room_id = r and arrival >= s.departure order by arrival limit 1;
    if nxt.id is not null and nxt.worker_id = s.worker_id and nxt.arrival = s.departure then continue; end if; -- back-to-back rotation
    select * into co from changeovers where from_stay_id = s.id;
    if co.id is null then
      insert into changeovers (room_id, from_stay_id, to_stay_id, after_date, ready_by) values (r, s.id, nxt.id, s.departure, nxt.arrival);
    else
      if (co.after_date <> s.departure or (nxt.arrival is not null and co.ready_by is not null and nxt.arrival < co.ready_by)) and co.status <> 'needs' then
        update changeovers set status = 'needs', scheduled_for = null, invalidated_reason = 'Dates changed (was ' || co.status || ') – needs rescheduling' where id = co.id;
        perform enqueue(array['manager','cleaner','client']::app_role[], '⚠ ' || room_label(r) || ' no longer ready', 'Stay extended or arrival brought forward', true);
      end if;
      update changeovers set after_date = s.departure, ready_by = nxt.arrival, to_stay_id = nxt.id, updated_at = now() where id = co.id;
    end if;
  end loop;
  -- a stay that became open-ended (TBC / until further notice) no longer needs its changeover
  delete from changeovers where room_id = r and from_stay_id is null; -- source stay cancelled
  delete from changeovers c using stays st where c.from_stay_id = st.id and st.room_id = r and st.departure is null;
end $$;

create or replace function stays_after() returns trigger language plpgsql security definer set search_path = public as $$
declare st stays := coalesce(new, old); msg text; urgent boolean;
begin
  perform reconcile_room(st.room_id);
  if tg_op = 'UPDATE' and old.room_id <> new.room_id then perform reconcile_room(old.room_id); end if;
  msg := case tg_op
    when 'INSERT' then (case when new.worker_id is null then 'Held ' else 'Booked ' end) || room_label(new.room_id) || ' for ' || stay_label(new) || ' from ' || to_char(new.arrival, 'Dy DD Mon')
    when 'DELETE' then 'Cancelled ' || stay_label(old) || ' · ' || room_label(old.room_id)
    else room_label(new.room_id) || ' · ' || stay_label(new) || ': ' ||
      concat_ws(', ', case when old.worker_id is null and new.worker_id is not null then 'named hold' end,
        case when old.arrival <> new.arrival then 'arrival ' || old.arrival || ' → ' || new.arrival end,
        case when old.departure is distinct from new.departure or old.dep_status <> new.dep_status then 'departure ' || coalesce(new.departure::text, new.dep_status::text) end,
        case when old.away_from is distinct from new.away_from then 'away dates' end) end;
  urgent := (st.arrival <= current_date + 2) or (st.departure = (now() at time zone 'Europe/London')::date);
  insert into activity (property_id, entity, entity_id, text) select property_id, 'stay', st.id::text, msg from rooms where id = st.room_id;
  perform enqueue(array['manager','cleaner','client']::app_role[], 'Roomboard · ' || room_label(st.room_id), msg, urgent);
  return null;
end $$;
create trigger stays_after after insert or update or delete on stays for each row execute function stays_after();

create or replace function co_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status <> 'needs' then new.invalidated_reason := null; end if;
    insert into activity (property_id, entity, entity_id, text) select property_id, 'changeover', new.id::text, 'Changeover ' || room_label(new.room_id) || ' → ' || new.status from rooms where id = new.room_id;
    perform enqueue(case when new.status = 'ready' then array['client','manager'] else array['manager','cleaner','client'] end::app_role[], 'Changeover ' || room_label(new.room_id) || ' → ' || new.status, coalesce('Scheduled ' || new.scheduled_for, ''), new.status = 'scheduled');
  end if; return new;
end $$;
create trigger co_after before update on changeovers for each row execute function co_after();

create or replace function enquiry_after() returns trigger language plpgsql security definer set search_path = public as $$
begin perform enqueue(array['manager']::app_role[], 'New accommodation request', (select name from properties where id = new.property_id) || ' · ' || new.people || ' people from ' || new.date_from, true);
  insert into activity (property_id, entity, entity_id, text) values (new.property_id, 'enquiry', new.id::text, 'Requested ' || (select name from properties where id = new.property_id)); return null; end $$;
create trigger enquiry_after after insert on enquiries for each row execute function enquiry_after();
