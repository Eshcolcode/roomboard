-- 0009 (19 Oct 2026): notification tiers, in-app alerts (the red dot), per-person alert settings, and an email
-- switch that is OFF. Mirrors src/data/notify.ts.
--   IMMEDIATE: new booking (contract or extras), cancellation, arrival or leaving date change, an open-ended stay
--              getting an end date, a move to another room -> notifications row (red dot) + email in alert_outbox.
--   MINOR:     names, phone, notes, away dates, guest swap on the same dates, confirmed departure -> activity only.
--   Housekeeper: alerted only when an IMMEDIATE change at a contract property touches the next 7 days.
-- Nothing is emailed until Eshcol sets app_settings 'notifications_live' to true: dispatch-alerts checks it first.

-- ---------- classification (same rules as classify() in src/data/notify.ts) ----------
create or replace function rb_change_tier(op text, o_arrival date, o_departure date, o_room text,
  n_arrival date, n_departure date, n_room text) returns text language sql immutable as $$
  select case
    when op in ('INSERT', 'DELETE') then 'immediate'
    when o_arrival is distinct from n_arrival or o_departure is distinct from n_departure or o_room is distinct from n_room then 'immediate'
    else 'minor' end $$;
create or replace function rb_change_reasons(op text, o_arrival date, o_departure date, o_room text,
  n_arrival date, n_departure date, n_room text, extra boolean) returns text[] language sql immutable as $$
  select case
    when op = 'INSERT' then array[case when extra then 'new extras booking' else 'new booking' end]
    when op = 'DELETE' then array[case when extra then 'extras booking cancelled' else 'cancellation' end]
    else array_remove(array[
      case when o_arrival is distinct from n_arrival then 'arrival date changed' end,
      case when o_departure is null and n_departure is not null then 'end date set'
           when o_departure is distinct from n_departure then 'leaving date changed' end,
      case when o_room is distinct from n_room then 'room changed' end], null) end $$;
create or replace function rb_touches_window(d date[], today date, days int default 7) returns boolean language sql immutable as $$
  select exists (select 1 from unnest(d) x where x between today and today + days) $$;

-- ---------- columns ----------
alter table activity add column if not exists kind text, add column if not exists tier text check (tier in ('immediate','minor')),
  add column if not exists reasons text[];
alter table profiles add column if not exists email_immediate boolean not null default true;
alter table alert_outbox add column if not exists tier text not null default 'immediate';
insert into app_settings (key, value) values ('notifications_live', 'false'::jsonb), ('housekeeper_alerts', 'true'::jsonb)
  on conflict (key) do nothing;

-- ---------- in-app alerts ----------
create table if not exists notifications (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  recipient_id uuid not null references profiles on delete cascade,
  stay_id uuid,
  property_id text,
  text text not null,
  reasons text[] not null default '{}',
  read_at timestamptz,
  dedupe_key text unique
);
create index if not exists notifications_recipient on notifications (recipient_id, read_at);
alter table notifications enable row level security;
drop policy if exists "notifications own" on notifications;
create policy "notifications own" on notifications for select using (recipient_id = auth.uid());
drop policy if exists "notifications read" on notifications;
create policy "notifications read" on notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
-- a person may only stamp read_at on their own rows
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke update on notifications from authenticated;
    grant select on notifications to authenticated;
    grant update (read_at) on notifications to authenticated;
  end if;
end $$;

-- ---------- the tier of the stay change being processed (set first, read by the alert routing, then cleared) ----------
-- Trigger names fire in name order: stays_a_tier runs before stays_after (0008), stays_b_tier_reset after it.
create or replace function stays_a_tier() returns trigger language plpgsql security definer set search_path = public as $$
declare st stays := coalesce(new, old); o stays := case when tg_op = 'INSERT' then null else old end;
  n stays := case when tg_op = 'DELETE' then null else new end; t text; r text[]; hk boolean;
begin
  t := rb_change_tier(tg_op, o.arrival, o.departure, o.room_id, n.arrival, n.departure, n.room_id);
  r := rb_change_reasons(tg_op, o.arrival, o.departure, o.room_id, n.arrival, n.departure, n.room_id, is_extra(st.room_id));
  hk := t = 'immediate' and not is_extra(st.room_id)
    and rb_touches_window(array[o.arrival, o.departure, n.arrival, n.departure], london_today());
  perform set_config('rb.tier', t, true);
  perform set_config('rb.reasons', array_to_string(r, '|'), true);
  perform set_config('rb.hk', case when hk then 'on' else '' end, true);
  perform set_config('rb.stay', st.id::text, true);
  return null;
end $$;
drop trigger if exists stays_a_tier on stays;
create trigger stays_a_tier after insert or update or delete on stays for each row execute function stays_a_tier();
create or replace function stays_b_tier_reset() returns trigger language plpgsql as $$
begin
  perform set_config('rb.tier', '', true); perform set_config('rb.reasons', '', true);
  perform set_config('rb.hk', '', true); perform set_config('rb.stay', '', true);
  return null;
end $$;
drop trigger if exists stays_b_tier_reset on stays;
create trigger stays_b_tier_reset after insert or update or delete on stays for each row execute function stays_b_tier_reset();

-- log lines carry the tier and kind of the change being processed
create or replace function log_activity(r text, msg text, ent text default null, ent_id text default null) returns void
language sql security definer set search_path = public as $$
  insert into activity (property_id, entity, entity_id, text, kind, tier, reasons)
  select property_id, ent, ent_id, msg, ent,
    case when ent = 'stay' then nullif(current_setting('rb.tier', true), '') end,
    case when ent = 'stay' then string_to_array(nullif(current_setting('rb.reasons', true), ''), '|') end
  from rooms where id = r $$;
create or replace function log_activity_private(r text, msg text, ent text default null, ent_id text default null) returns void
language sql security definer set search_path = public as $$
  insert into activity (property_id, entity, entity_id, text, manager_only, kind, tier, reasons)
  select property_id, ent, ent_id, msg, true, ent,
    case when ent = 'stay' then nullif(current_setting('rb.tier', true), '') end,
    case when ent = 'stay' then string_to_array(nullif(current_setting('rb.reasons', true), ''), '|') end
  from rooms where id = r $$;

-- one person: the red dot always; the email only if they want it (queued; sent only once notifications are live)
create or replace function notify_user(p profiles, subj text, msg text, evt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p.id is not distinct from auth.uid() then return; end if;
  insert into notifications (recipient_id, stay_id, text, reasons, dedupe_key)
  values (p.id, nullif(current_setting('rb.stay', true), '')::uuid, msg,
    coalesce(string_to_array(nullif(current_setting('rb.reasons', true), ''), '|'), '{}'), evt || ':' || p.id)
  on conflict (dedupe_key) do nothing;
  if p.email_immediate then perform enqueue_user(p, subj, msg, evt); end if;
end $$;

-- stay changes: minor -> nothing (activity only). Important -> RJ McLeod's changes to Eshcol, Eshcol's to RJ McLeod,
-- and the housekeeper when it touches the next 7 days at a contract property (and Eshcol has that switched on).
create or replace function alert_stay_change(subj text, msg text, evt text) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles; t text := coalesce(nullif(current_setting('rb.tier', true), ''), 'immediate');
begin
  if t = 'minor' then return; end if;
  for p in select * from profiles where role = case my_role() when 'client' then 'manager'::app_role when 'manager' then 'client'::app_role end loop
    perform notify_user(p, subj, msg, evt);
  end loop;
  if current_setting('rb.hk', true) = 'on'
     and coalesce((select value from app_settings where key = 'housekeeper_alerts'), 'true'::jsonb) <> 'false'::jsonb then
    for p in select * from profiles where role = 'cleaner' loop
      perform notify_user(p, 'Cleaning plan · ' || subj, msg, evt || ':hk');
    end loop;
  end if;
end $$;

-- RJ McLeod's activity: only stay, crew (series) and worker entries (never changeovers/cleaning, rates, calendar sync,
-- settings or anything untagged)
drop policy if exists "activity read" on activity;
create policy "activity read" on activity for select using (
  my_role() = 'manager'
  or (my_role() = 'client' and not manager_only and coalesce(kind, entity) in ('stay', 'rota', 'worker', 'series')));  -- untagged = Eshcol only

-- is email switched on? (dispatch-alerts asks this before sending anything)
create or replace function notifications_live() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from app_settings where key = 'notifications_live'), false) $$;
