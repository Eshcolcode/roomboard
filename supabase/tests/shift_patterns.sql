-- 0015 shift patterns: who may read / write. Live-safe: one block that always ends in an exception, so every
-- write (test users, stays, patterns) is rolled back. Run: psql -X -At -f supabase/tests/shift_patterns.sql
do $t$
declare r text := ''; n int; sid uuid; xid uuid; pid uuid;
  c uuid := 'aaaaaaaa-0000-0000-0000-0000000000c1'; m uuid := 'aaaaaaaa-0000-0000-0000-0000000000c2'; h uuid := 'aaaaaaaa-0000-0000-0000-0000000000c3';
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (c,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','shift-test-client@invalid'),
    (m,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','shift-test-manager@invalid'),
    (h,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','shift-test-cleaner@invalid');
  insert into profiles (id, full_name, role, email) values (c,'RJ McLeod','client',''),(m,'Eshcol','manager',''),(h,'Housekeeper','cleaner','');
  insert into stays (room_id, hold_label, arrival, departure) values ('es-3', 'Shift test', '2031-01-06', '2031-02-06') returning id into sid;
  insert into stays (room_id, hold_label, arrival, departure) values ('x-monadh', 'Shift test extra', '2031-01-06', '2031-01-09') returning id into xid;
  -- anon
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin select count(*) into n from shift_patterns; r := r || format(E'\nP1 anon reads 0 patterns: %s', n = 0);
  exception when others then r := r || E'\nP1 anon reads 0 patterns: true (no access)'; end;
  begin insert into shift_patterns (name, days_on, days_off, start_dow) values ('x', 1, 1, 1); r := r || E'\nP2 FAIL anon created a pattern';
  exception when others then r := r || E'\nP2 anon cannot create patterns: true'; end;
  reset role;
  -- client (RJ McLeod) creates and applies a pattern on a contract room
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  insert into shift_patterns (name, days_on, days_off, start_dow) values ('10 on / 4 off, Mon start', 10, 4, 1) returning id into pid;
  r := r || E'\nP3 RJ McLeod creates a pattern: true';
  update shift_patterns set name = '10 on / 4 off (Mon)' where id = pid; get diagnostics n = row_count;
  r := r || format(E'\nP4 RJ McLeod edits a pattern: %s', n = 1);
  insert into stay_shifts (stay_id, pattern_id, cycle_start) values (sid, pid, '2031-01-06');
  r := r || E'\nP5 RJ McLeod applies a pattern to a contract stay: true';
  update stay_shifts set overrides = '{"2031-01-17":"in"}' where stay_id = sid; get diagnostics n = row_count;
  r := r || format(E'\nP6 RJ McLeod sets a one-off day: %s', n = 1);
  begin insert into stay_shifts (stay_id, pattern_id, cycle_start) values (xid, pid, '2031-01-06'); r := r || E'\nP7 FAIL RJ McLeod applied a pattern to an extra property';
  exception when others then r := r || E'\nP7 RJ McLeod cannot apply a pattern on an extra property: true'; end;
  reset role;
  -- housekeeper reads only
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',h,'role','authenticated')::text, true);
  select count(*) into n from shift_patterns where id = pid; r := r || format(E'\nP8 housekeeper reads patterns: %s', n = 1);
  select count(*) into n from stay_shifts where stay_id = sid; r := r || format(E'\nP9 housekeeper reads stay patterns: %s', n = 1);
  update shift_patterns set name = 'hk' where id = pid; get diagnostics n = row_count;
  r := r || format(E'\nP10 housekeeper cannot edit patterns: %s', n = 0);
  update stay_shifts set overrides = '{}' where stay_id = sid; get diagnostics n = row_count;
  r := r || format(E'\nP11 housekeeper cannot change a stay pattern: %s', n = 0);
  begin insert into shift_patterns (name, days_on, days_off, start_dow) values ('hk', 1, 1, 1); r := r || E'\nP12 FAIL housekeeper created a pattern';
  exception when others then r := r || E'\nP12 housekeeper cannot create patterns: true'; end;
  delete from shift_patterns where id = pid; get diagnostics n = row_count;
  r := r || format(E'\nP13 housekeeper cannot delete patterns: %s', n = 0);
  reset role;
  -- manager: applies on an extra too, and deleting the stay removes its pattern row
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  insert into stay_shifts (stay_id, pattern_id, cycle_start) values (xid, pid, '2031-01-06');
  r := r || E'\nP14 Eshcol applies a pattern anywhere: true';
  delete from stays where id = sid;
  select count(*) into n from stay_shifts where stay_id = sid; r := r || format(E'\nP15 cancelling a stay removes its pattern: %s', n = 0);
  delete from shift_patterns where id = pid;
  select count(*) into n from stay_shifts where stay_id = xid; r := r || format(E'\nP16 deleting a pattern takes it off its stays: %s', n = 0);
  reset role;
  begin insert into shift_patterns (name, days_on, days_off, start_dow) values ('bad', 0, 4, 1); r := r || E'\nP17 FAIL 0 days on accepted';
  exception when others then r := r || E'\nP17 0 days on refused: true'; end;
  raise exception 'SHIFT_RESULTS (rolled back)%', r;
end $t$;
