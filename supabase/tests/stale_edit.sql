-- 0013: a stale edit fails at once with PT409 (HTTP 409), never 40001 (which PostgREST retries forever).
-- Rolls itself back. Run: psql -X -At -f supabase/tests/stale_edit.sql
begin;
insert into stays (id, room_id, hold_label, arrival, departure, dep_status) values ('00000000-0000-0000-0000-0000000000e1', 'es-2', 'Stale test', '2030-01-07', '2030-01-10', 'planned');
update stays set notes = 'first save' where id = '00000000-0000-0000-0000-0000000000e1' and version = 1;
create temp table stale_res (t text) on commit drop;
do $$ declare st text; begin
  begin
    update stays set notes = 'stale save', version = 1 where id = '00000000-0000-0000-0000-0000000000e1';
    st := 'none';
  exception when others then st := sqlstate; end;
  insert into stale_res values (st);
end $$;
select 'S1 stale edit refused with PT409 (no PostgREST retry): ' || (t = 'PT409') || ' (' || t || ')' from stale_res;
select 'S2 first save kept: ' || (version = 2 and notes = 'first save') from stays where id = '00000000-0000-0000-0000-0000000000e1';
rollback;
