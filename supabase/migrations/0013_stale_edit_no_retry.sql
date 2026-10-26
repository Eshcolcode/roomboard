-- 0013 (26 Oct 2026): a stale edit must fail fast with HTTP 409, never hang.
-- stays_before raised SQLSTATE 40001 (serialization_failure) on a stale version. PostgREST treats 40001 as
-- transient and retries the whole transaction forever (Supabase KB: "SQLSTATE 40001 in an RPC function causes
-- infinite retries"; fixed only in PostgREST 16), so when two people edited the same stay the second save spun
-- with no message and a database backend looped until terminated (found in the live end-to-end test, 26 Oct).
-- PT409 = PostgREST's own code for "respond 409 Conflict": no retry, and the app shows "changed by someone else".
-- Same body as 0002 otherwise. Trigger function only (not callable over the API), so no grants change.
create or replace function stays_before() returns trigger language plpgsql as $$
declare c record; e text;
begin
  if tg_op = 'UPDATE' then
    if new.version is distinct from old.version then
      raise exception 'This stay was changed by someone else while you were editing' using errcode = 'PT409';
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
