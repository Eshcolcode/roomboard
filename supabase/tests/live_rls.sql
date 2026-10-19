-- Live-safe check: runs as one block and always ends in an exception, so every write is rolled back.
-- Run: supabase db query --linked -f supabase/tests/live_rls.sql (results are in the error text).
do $t$
declare r text := ''; n int; ok boolean;
  c uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; m uuid := 'aaaaaaaa-0000-0000-0000-000000000002'; h uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  w uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1'; sid uuid;
  procedure_dummy int;
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (c,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-client@invalid'),
    (m,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-manager@invalid'),
    (h,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-cleaner@invalid');
  insert into profiles (id, full_name, role, email) values (c,'RJ McLeod','client',''),(m,'Eshcol','manager',''),(h,'Housekeeper','cleaner','');
  -- anon
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from properties; r := r || format(E'\nA1 anon reads 0 properties: %s (%s)', n=0, n);
  select count(*) into n from ical_blocks; r := r || format(E'\nA2 anon reads 0 ical_blocks: %s', n=0);
  begin perform queue_digest(); r := r || E'\nA3 FAIL anon can call queue_digest'; exception when others then r := r || E'\nA3 anon cannot call queue_digest: true'; end;
  reset role;
  -- manager actions
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  insert into workers (id, name) values (w, 'Test Worker');
  insert into stays (room_id, worker_id, arrival, departure) values ('lr-1', w, '2027-03-01', '2027-03-05');
  insert into stays (room_id, hold_label, arrival, departure) values ('x-monadh', 'Eshcol own', '2027-03-10', '2027-03-12');
  update app_settings set value = '360' where key = 'rate_per_room_week';
  select count(*) into n from ical_feeds; r := r || format(E'\nM1 manager reads ical_feeds (4): %s', n=4);
  select count(*) into n from activity; r := r || format(E'\nM2 manager sees all activity: %s rows', n);
  reset role;
  -- client
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  select my_role()::text = 'client' into ok; r := r || format(E'\nC0 my_role = client: %s', ok);
  insert into stays (room_id, worker_id, arrival, departure) values ('es-1', w, '2027-03-01', '2027-03-08') returning id into sid;
  r := r || E'\nC1 client books contract room es-1: true';
  select count(*) into n from activity where manager_only; r := r || format(E'\nC2 client sees 0 manager-only activity: %s', n=0);
  select count(*) into n from activity where coalesce(kind, entity) not in ('stay','rota','worker','series'); r := r || format(E'\nC3 client sees no rate/sync/other activity: %s', n=0);
  select count(*) into n from activity; r := r || format(E'\nC4 client sees own+contract stay activity: %s rows', n);
  select count(*) into n from profiles where role = 'cleaner'; r := r || format(E'\nC5 client cannot read housekeeper profile: %s', n=0);
  select count(*) into n from ical_feeds; r := r || format(E'\nC6 client reads 0 ical_feeds: %s', n=0);
  select count(*) into n from app_settings_history; r := r || format(E'\nC7 client reads 0 rate history: %s', n=0);
  select count(*) into n from stays where room_id = 'x-monadh'; r := r || format(E'\nC8 client cannot read Eshcol''s own Monadh booking: %s', n=0);
  select count(*) into n from extra_taken() where room_id = 'x-monadh'; r := r || format(E'\nC9 client sees it as dates only via extra_taken: %s', n=1);
  update changeovers set status = 'ready'; get diagnostics n = row_count; r := r || format(E'\nC10 client updates 0 changeovers: %s', n=0);
  select count(*) into n from alert_outbox where recipient_id <> c; r := r || format(E'\nC11 client reads no one else''s alerts: %s', n=0);
  begin update app_settings set value = '1' where key = 'rate_per_room_week'; get diagnostics n = row_count; r := r || format(E'\nC12 client changes rate: 0 rows %s', n=0);
  exception when others then r := r || E'\nC12 client rate change refused: true'; end;
  begin insert into stays (room_id, hold_label, arrival, departure) values ('x-monadh', 'X', '2026-11-17', '2026-11-18'); r := r || E'\nC13 FAIL iCal-blocked date accepted';
  exception when others then r := r || format(E'\nC13 iCal-taken Monadh date refused: true (%s)', sqlerrm); end;
  select count(*) into n from notifications; r := r || format(E'\nC14 client red-dot rows from Eshcol''s contract booking: %s', n);

  begin
    perform apply_series('{"label":"Crew T","property_id":"p-lr","start_date":"2027-02-01","on_days":5,"off_days":2,"off_mode":"keep","end_kind":"cycles","cycles":2,"slots":[]}'::jsonb,
      (select jsonb_agg(jsonb_build_object('room_id', 'lr-2', 'hold_label', 'Name TBC', 'arrival', a, 'departure', d, 'away_from', af, 'away_to', at, 'slot', 0))
       from rb_rotation('2027-02-01', 5, 2, 'cycles', null, 2, 'keep') g(a, d, af, at)), '[]', '{}', 'booked');
    select count(*) into n from stays where room_id = 'lr-2'; r := r || format(E'\nC15 client crew booking (apply_series) works after lockdown: %s (%s stays)', n > 0, n);
  exception when others then r := r || format(E'\nC15 FAIL apply_series: %s', sqlerrm); end;
  begin perform enqueue_role('manager', 'x', 'y', 'z'); r := r || E'\nC16 FAIL client can call enqueue_role';
  exception when others then r := r || format(E'\nC16 client cannot call enqueue_role: true (%s)', sqlerrm); end;
  begin perform replace_ical_blocks((select id from ical_feeds limit 1), null); r := r || E'\nC17 FAIL client can call replace_ical_blocks';
  exception when others then r := r || E'\nC17 client cannot call replace_ical_blocks: true'; end;
  reset role;
  -- housekeeper
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',h,'role','authenticated')::text, true);
  begin insert into stays (room_id, worker_id, arrival, departure) values ('es-2', w, '2027-04-01', '2027-04-03'); r := r || E'\nH1 FAIL housekeeper inserted a stay';
  exception when others then r := r || E'\nH1 housekeeper cannot add stays: true'; end;
  select count(*) into n from workers; r := r || format(E'\nH2 housekeeper reads 0 workers: %s', n=0);
  select count(*) into n from activity; r := r || format(E'\nH3 housekeeper reads 0 activity: %s', n=0);
  reset role;
  select count(*) into n from alert_outbox where status = 'queued'; r := r || format(E'\nX1 alerts queued in this test (rolled back, never sent): %s', n);
  raise exception 'RLS_RESULTS (rolled back)%', r;
end $t$;
