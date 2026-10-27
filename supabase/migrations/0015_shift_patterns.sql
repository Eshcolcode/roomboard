-- 0015 (27 Oct 2026): shift patterns. A pattern (e.g. '10 on / 4 off, Mon start') is set up once and applied to
-- any stay. The room stays taken for the WHOLE stay; the pattern only says which nights the person is in and which
-- they are away (room kept). Nothing here changes stays, availability, iCal export or the cleaning rules.
-- Eshcol (manager) and RJ McLeod (client) create, edit and apply patterns; the Housekeeper reads them.
create table if not exists shift_patterns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  days_on int not null check (days_on between 1 and 60),
  days_off int not null check (days_off between 1 and 60),
  start_dow int not null check (start_dow between 0 and 6),  -- weekday of the first on-day: 0 = Sunday … 6 = Saturday
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One row per stay that follows a pattern. cycle_start = first on-day. overrides = one-off days, {"2026-11-06": "in"}.
create table if not exists stay_shifts (
  stay_id uuid primary key references stays on delete cascade,
  pattern_id uuid not null references shift_patterns on delete cascade,
  cycle_start date not null,
  overrides jsonb not null default '{}' check (jsonb_typeof(overrides) = 'object'),
  updated_by uuid references auth.users default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists stay_shifts_pattern on stay_shifts(pattern_id);

alter table shift_patterns enable row level security;
alter table stay_shifts enable row level security;
drop policy if exists "patterns read" on shift_patterns;
drop policy if exists "patterns write" on shift_patterns;
drop policy if exists "stay shifts read" on stay_shifts;
drop policy if exists "stay shifts write" on stay_shifts;
create policy "patterns read" on shift_patterns for select using (auth.uid() is not null);
create policy "patterns write" on shift_patterns for all using (my_role() in ('manager', 'client'))
  with check (my_role() in ('manager', 'client'));
create policy "stay shifts read" on stay_shifts for select using (auth.uid() is not null);
-- same rule as writing the stay itself (0003): RJ McLeod only on the contracted houses
create policy "stay shifts write" on stay_shifts for all
  using (my_role() = 'manager' or (my_role() = 'client' and exists (select 1 from stays s join rooms r on r.id = s.room_id
    join properties p on p.id = r.property_id where s.id = stay_id and p.contracted)))
  with check (my_role() = 'manager' or (my_role() = 'client' and exists (select 1 from stays s join rooms r on r.id = s.room_id
    join properties p on p.id = r.property_id where s.id = stay_id and p.contracted)));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table shift_patterns; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table stay_shifts; exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------- 0010's lockdown again (Supabase grants every new function to anon and authenticated) ----------
-- (0015 adds no functions; tables are reached only through the RLS policies above, never by anon.)
do $$
declare f record;
  everyone text[] := array['my_role', 'is_extra'];
  signed_in text[] := array['extra_taken', 'dismiss_changeover', 'indicative_price', 'log_activity', 'alert_stay_change'];
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then return; end if;  -- plain Postgres (qa/sql.sh)
  execute 'revoke all on table shift_patterns, stay_shifts from anon';
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname = any(everyone) then execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.proname = any(signed_in) then execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
