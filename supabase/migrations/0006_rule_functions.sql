-- Pure rule functions. Same rules as src/data/rules.ts; both are tested against rules/cases.json
-- (vitest and qa/sql-rules.mjs). The triggers in 0002_rules.sql call these, so there is one SQL source.

create or replace function rb_nights(arrival date, departure date) returns int language sql immutable as $$
  select departure - arrival $$;

-- arrival inclusive, departure exclusive; null departure = open-ended
create or replace function rb_overlaps(a1 date, a2 date, b1 date, b2 date) returns boolean language sql immutable as $$
  select daterange(a1, coalesce(a2, 'infinity'), '[)') && daterange(b1, coalesce(b2, 'infinity'), '[)') $$;

-- 'open' | 'continues' | 'zero_day' | 'changeover'
create or replace function rb_boundary(dep_worker uuid, departure date, dep_status text, next_worker uuid, next_arrival date)
returns text language sql immutable as $$
  select case
    when departure is null or dep_status in ('tbc', 'ufn') then 'open'
    when next_arrival = departure and next_worker is not null and next_worker = dep_worker then 'continues'
    when next_arrival = departure then 'zero_day'
    else 'changeover' end $$;

-- null | 'before_departure' | 'after_next_arrival'
create or replace function rb_clean_window(after_date date, ready_by date, d date) returns text language sql immutable as $$
  select case when d < after_date then 'before_departure'
              when ready_by is not null and d > ready_by then 'after_next_arrival' end $$;

-- target: 'vacated' | 'in_progress' | 'ready'. null | 'before_departure' | 'needs_vacated'
create or replace function rb_status_gate(target text, vacated boolean, today date, after_date date) returns text language sql immutable as $$
  select case when today < after_date then 'before_departure'
              when target <> 'vacated' and not vacated then 'needs_vacated' end $$;

-- non-clash stay checks; 'others' is a jsonb array of {arrival, departure} in the same room
create or replace function rb_stay_error(arrival date, departure date, dep_status text, away_from date, away_to date, others jsonb default '[]')
returns text language plpgsql immutable as $$
declare dep date := case when dep_status in ('tbc', 'ufn') then null else departure end; o jsonb;
begin
  if arrival is null then return 'no_arrival'; end if;
  if dep is null and dep_status not in ('tbc', 'ufn') then return 'no_departure'; end if;
  if away_from is not null or away_to is not null then
    if away_from is null or away_to is null or away_to <= away_from then return 'away_order'; end if;
    if away_from < arrival or (dep is not null and away_to > dep) then return 'away_outside'; end if;
  end if;
  if dep is not null and dep <= arrival then return 'departure_not_after_arrival'; end if;
  for o in select * from jsonb_array_elements(coalesce(others, '[]')) loop
    if rb_overlaps((o->>'arrival')::date, nullif(o->>'departure', '')::date, arrival, dep) then return 'clash'; end if;
  end loop;
  return null;
end $$;
