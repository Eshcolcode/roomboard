-- Live-safe check: runs as one block and always ends in an exception, so every write is rolled back.
-- Run: supabase db query --linked -f supabase/tests/live_rls.sql (results are in the error text).
do $t$
declare r text := ''; n int; c uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; m uuid := 'aaaaaaaa-0000-0000-0000-000000000002'; h uuid := 'aaaaaaaa-0000-0000-0000-000000000003'; w uuid := gen_random_uuid(); s1 uuid; s2 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email) values (c,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t1@invalid'),(m,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2@invalid'),(h,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','t3@invalid');
  insert into profiles (id, full_name, role, email) values (c,'RJ McLeod','client','x@invalid'),(m,'Eshcol','manager','y@invalid'),(h,'Housekeeper','cleaner','z@invalid');
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  insert into workers (id, name) values (w, 'Test Worker');
  insert into stays (room_id, worker_id, arrival, departure) values ('es-3', w, london_today() + 1, london_today() + 4) returning id into s1;
  insert into stays (room_id, hold_label, arrival, departure, dep_status) values ('es-3', 'Name to follow', london_today() + 5, null, 'tbc') returning id into s2;
  update stays set departure = london_today() + 3 where id = s1;
  update stays set notes = 'minor' where id = s1;
  select count(*) into n from changeovers where room_id = 'es-3'; r := r || format(E'\nF1 changeover derived: %s', n);
  reset role;
  select count(*) into n from notifications where recipient_id = m; r := r || format(E'\nF2 Eshcol red-dot rows (2 bookings + date change, notes not counted): %s', n);
  select count(*) into n from notifications where recipient_id = h; r := r || format(E'\nF3 housekeeper alerts (within 7 days): %s', n);
  select count(*) into n from alert_outbox where status = 'queued'; r := r || format(E'\nF4 emails queued but not sent (live=false): %s', n);
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  update changeovers set status = 'scheduled', scheduled_for = london_today() + 3, cleaner_id = h where room_id = 'es-3';
  get diagnostics n = row_count; r := r || format(E'\nF5 Eshcol schedules the clean: %s row', n);
  delete from stays where id = s2; get diagnostics n = row_count; r := r || format(E'\nF6 Eshcol cancels the hold: %s row', n);
  reset role;
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  select count(*) into n from activity; r := r || format(E'\nF7 RJ activity rows: %s', n);
  select count(*) into n from activity where text ~* 'housekeeper|cleaner' ; r := r || format(E'\nF8 RJ activity rows naming housekeeping: %s', n);
  reset role;
  raise exception 'FLOW_RESULTS (rolled back)%', r;
end $t$;
