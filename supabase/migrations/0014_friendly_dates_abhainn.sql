-- 0014 (26 Oct 2026): two tidy-ups Donald approved.
-- 1. Friendly dates in activity, red-dot alerts and emails: '2026-11-06' becomes '6 Nov' ('4 Jan 2027' when not this
--    year), and 'Thu 05 Nov' becomes 'Thu 5 Nov'. Done once, as rows are written, so every function that writes these
--    texts (stays_after, reconcile_room, apply_series, replace_ical_blocks, ...) is covered without copying them here.
--    Rows already written are left as they are (the app shows them friendly as well).
-- 2. 'Abhainn Cottage' is now just 'Abhainn', like Harris, Uig and Monadh. Ids and slugs are unchanged.

-- ---------- 1. friendly dates ----------
create or replace function rb_d(d date, today date default london_today()) returns text language sql stable as $$
  select to_char(d, 'FMDD Mon') || case when extract(year from d) = extract(year from today) then '' else ' ' || extract(year from d) end $$;

create or replace function rb_dates(t text, today date default london_today()) returns text language plpgsql stable as $$
declare m text; d date; r text := t;
begin
  if t is null then return null; end if;
  for m in select distinct x[1] from regexp_matches(t, '(?:^|[^0-9-])([0-9]{4}-[0-9]{2}-[0-9]{2})(?![0-9-])', 'g') x loop
    begin
      d := to_date(m, 'YYYY-MM-DD');
      if to_char(d, 'YYYY-MM-DD') = m then r := replace(r, m, rb_d(d, today)); end if;
    exception when others then null;  -- not a real date: left as written
    end;
  end loop;
  return regexp_replace(r, '\m(Mon|Tue|Wed|Thu|Fri|Sat|Sun) 0([1-9]) ([A-Z][a-z]{2})\M', '\1 \2 \3', 'g');
end $$;

create or replace function rb_friendly_text() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'alert_outbox' then
    new.subject := rb_dates(new.subject); new.body := rb_dates(new.body);
  else
    new.text := rb_dates(new.text);
  end if;
  return new;
end $$;
drop trigger if exists activity_friendly_dates on activity;
create trigger activity_friendly_dates before insert on activity for each row execute function rb_friendly_text();
drop trigger if exists notifications_friendly_dates on notifications;
create trigger notifications_friendly_dates before insert on notifications for each row execute function rb_friendly_text();
drop trigger if exists alert_outbox_friendly_dates on alert_outbox;
create trigger alert_outbox_friendly_dates before insert on alert_outbox for each row execute function rb_friendly_text();

-- ---------- 2. Abhainn ----------
update properties set name = 'Abhainn', short_name = 'Abhainn',
  details = replace(details::text, 'Abhainn Cottage', 'Abhainn')::jsonb
  where id = 'p-cottage' and (name <> 'Abhainn' or short_name <> 'Abhainn' or details::text like '%Abhainn Cottage%');
update units set name = 'Abhainn' where id = 'un-cottage' and name <> 'Abhainn';
update ical_feeds set label = 'Abhainn calendar' where room_id = 'x-cottage' and label = 'Abhainn Cottage calendar';

-- ---------- 0010's lockdown again (Supabase grants every new function to anon and authenticated) ----------
-- rb_d / rb_dates are plain helpers used only inside the trigger; nobody calls them over the API.
revoke execute on function rb_d(date, date), rb_dates(text, date), rb_friendly_text() from public;
do $$
declare f record;
  everyone text[] := array['my_role', 'is_extra'];
  signed_in text[] := array['extra_taken', 'dismiss_changeover', 'indicative_price', 'log_activity', 'alert_stay_change'];
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then return; end if;  -- plain Postgres (qa/sql.sh)
  execute 'revoke execute on function rb_d(date, date), rb_dates(text, date) from anon, authenticated';
  execute 'grant execute on function rb_d(date, date), rb_dates(text, date) to service_role';
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname = any(everyone) then execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.proname = any(signed_in) then execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
