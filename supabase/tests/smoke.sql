-- Local smoke test (plain Postgres + 00_local_stub.sql). Mirrors the demo checks.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into profiles (id,full_name,role,email,phone) values ('00000000-0000-0000-0000-000000000001','RJ McLeod','client','',null),('00000000-0000-0000-0000-000000000002','Eshcol','manager','d@x',null),('00000000-0000-0000-0000-000000000003','Housekeeper','cleaner','m@x',null);
insert into workers(id,name) values ('00000000-0000-0000-0000-0000000000a1','Neil'),('00000000-0000-0000-0000-0000000000a2','Iain'),('00000000-0000-0000-0000-0000000000a3','Daniel');
set request.uid = '00000000-0000-0000-0000-000000000001'; -- RJ McLeod
insert into stays(room_id,worker_id,arrival,departure,dep_status) values ('lr-8','00000000-0000-0000-0000-0000000000a1','2026-10-02','2026-10-16','confirmed');
insert into stays(room_id,hold_label,arrival,dep_status) values ('lr-8','Name to follow','2026-10-20','tbc');
select 'T1 changeover created' t, count(*) = 1 ok from changeovers where room_id='lr-8';
select 'T2 provider alerted for client edit' t, count(*) > 0 ok from alert_outbox o join profiles p on p.id=o.recipient_id where p.role='manager';
select 'T3 client not alerted for own edit' t, count(*) = 0 ok from alert_outbox o where recipient_id='00000000-0000-0000-0000-000000000001';
set request.uid = '00000000-0000-0000-0000-000000000002'; -- Eshcol
update changeovers set status='scheduled', scheduled_for='2026-10-17', cleaner_id='00000000-0000-0000-0000-000000000003' where room_id='lr-8';
select 'T4 cleaner alerted on schedule' t, count(*) > 0 ok from alert_outbox where recipient_id='00000000-0000-0000-0000-000000000003';
-- C2 out of window
do $$ begin update changeovers set scheduled_for='2026-10-21' where room_id='lr-8'; raise notice 'FAIL C2 not blocked'; exception when others then raise notice 'PASS C2 out-of-window clean blocked: %', sqlerrm; end $$;
update changeovers set scheduled_for='2026-10-21', exception_reason='provider override' where room_id='lr-8';
select 'T5 provider exception allowed + flagged' t, exception_reason is not null ok from changeovers where room_id='lr-8';
update changeovers set scheduled_for='2026-10-17' where room_id='lr-8';
-- C1 ready requires vacated
do $$ begin update changeovers set status='ready' where room_id='lr-8'; raise notice 'FAIL C1'; exception when others then raise notice 'PASS C1 ready without vacated blocked: %', sqlerrm; end $$;
-- item 1: bring arrival forward invalidates, row kept, same id
create temp table ids as select id from changeovers where room_id='lr-8';
set request.uid = '00000000-0000-0000-0000-000000000001';
update stays set version = version, arrival='2026-10-19' where room_id='lr-8' and hold_label is not null;
select 'T6 invalidated, same id, needs' t, (status='needs' and invalidated_reason is not null and id = (select id from ids)) ok from changeovers where room_id='lr-8';
select 'T7 provider alerted on invalidation' t, count(*) > 0 ok from alert_outbox where subject like '%needs rescheduling%' and recipient_id='00000000-0000-0000-0000-000000000002';
-- scheduled then departure made open-ended -> kept + flagged
set request.uid = '00000000-0000-0000-0000-000000000002';
update changeovers set status='scheduled', scheduled_for='2026-10-17' where room_id='lr-8';
set request.uid = '00000000-0000-0000-0000-000000000001';
delete from stays where room_id='lr-8' and hold_label is not null;
update stays set version = version, dep_status='ufn' where room_id='lr-8' and worker_id='00000000-0000-0000-0000-0000000000a1';
select 'T8 scheduled changeover never silently deleted' t, cancelled_reason is not null ok from changeovers where room_id='lr-8';
-- stale edit
do $$ begin update stays set version = version - 1, notes='x' where room_id='lr-8' and worker_id is not null; raise notice 'FAIL stale'; exception when serialization_failure then raise notice 'PASS stale edit rejected'; end $$;
-- clash (friendly) and concurrency guarantee
do $$ begin insert into stays(room_id,worker_id,arrival,departure) values ('lr-8','00000000-0000-0000-0000-0000000000a2','2026-10-25','2026-10-30'); raise notice 'FAIL clash'; exception when others then raise notice 'PASS clash blocked: %', sqlerrm; end $$;
-- same worker continues, different worker zero-day
insert into stays(room_id,worker_id,arrival,departure) values ('lr-9','00000000-0000-0000-0000-0000000000a3','2026-10-01','2026-10-10'),('lr-9','00000000-0000-0000-0000-0000000000a3','2026-10-10','2026-10-20');
select 'T9 continues: no clean' t, count(*) = 1 ok from changeovers where room_id='lr-9'; -- only the final departure
insert into stays(room_id,worker_id,arrival,departure) values ('lr-1','00000000-0000-0000-0000-0000000000a1','2026-11-01','2026-11-05'),('lr-1','00000000-0000-0000-0000-0000000000a2','2026-11-05','2026-11-09');
select 'T10 zero-day changeover' t, bool_or(zero_day) ok from changeovers where room_id='lr-1';
select 'T11 dedupe key unique' t, count(*) = count(distinct dedupe_key) ok from alert_outbox;
set request.uid = '00000000-0000-0000-0000-000000000002';
insert into stays(room_id,worker_id,arrival,departure) values ('lr-6','00000000-0000-0000-0000-0000000000a2','2026-12-01','2026-12-05');
select 'T12 no_address for blank email' t, count(*) > 0 ok from alert_outbox where status='no_address';
-- crew rotation (0007): 2 unnamed holds, 5 on / 2 off, 3 cycles, room kept on off days
set request.uid = '00000000-0000-0000-0000-000000000002';
select count(*) as before_alerts from alert_outbox \gset
select apply_series('{"label":"Crew T","property_id":"p-lr","start_date":"2027-02-01","on_days":5,"off_days":2,"off_mode":"keep","end_kind":"cycles","cycles":3,"slots":[]}'::jsonb,
  (select jsonb_agg(jsonb_build_object('room_id', r, 'hold_label', 'Name TBC ' || sl, 'arrival', a, 'departure', d, 'away_from', af, 'away_to', at, 'slot', sl))
   from (values ('lr-2', 0), ('lr-3', 1)) v(r, sl), lateral (select arrival a, departure d, away_from af, away_to at from rb_rotation('2027-02-01', 5, 2, 'cycles', null, 3, 'keep')) g),
  '[]', '{}', 'booked') as sid \gset
select 'T13 crew: 6 stays generated' t, count(*) = 6 ok from stays where series_id = :'sid';
select 'T14 crew keep: one clean per room (end only)' t, count(*) = 2 ok from changeovers c join stays s on s.id = c.from_stay_id where s.series_id = :'sid';
select 'T15 crew: one summary alert per recipient, not one per stay' t, count(*) - :before_alerts between 1 and 2 ok from alert_outbox;
do $$ begin perform apply_series('{"label":"Clash","property_id":"p-lr","start_date":"2027-02-01","on_days":5,"off_days":2,"off_mode":"keep","end_kind":"cycles","cycles":1}'::jsonb,
  '[{"room_id":"lr-2","hold_label":"X","arrival":"2027-02-03","departure":"2027-02-06","slot":0}]', '[]', '{}', 'booked'); raise notice 'FAIL crew clash';
exception when others then raise notice 'PASS crew clash rolls back whole booking: %', sqlerrm; end $$;
select 'T16 crew clash left nothing behind' t, count(*) = 0 ok from series where label = 'Clash';
-- extras: direct bookings (no request step), privacy, indicative prices, iCal blocks (0008)
set request.uid = '00000000-0000-0000-0000-000000000001'; -- RJ McLeod
insert into stays(room_id,hold_label,arrival,departure) values ('x-pod1','Calum','2027-03-01','2027-03-04');
select 'T17 client books an extra straight away (no request step), recorded as hers' t, booked_by = '00000000-0000-0000-0000-000000000001' ok from stays where room_id='x-pod1' and hold_label='Calum';
select 'T17a no request column any more' t, not exists (select 1 from information_schema.columns where table_name='stays' and column_name='request') ok;
select 'T18 Eshcol alerted: New booking with the indicative price (1 bedroom, £350/7 x 3 = £150)' t, count(*) > 0 ok from alert_outbox
  where subject like 'New booking%' and body like '%Indicative £150 for 3 nights%' and recipient_id='00000000-0000-0000-0000-000000000002';
select 'T19 extras make no changeovers' t, count(*) = 0 ok from changeovers where room_id like 'x-%';
update stays set version = version, notes = 'Late arrival' where room_id='x-pod1' and hold_label='Calum';
select 'T20 client can change their own extra booking' t, notes = 'Late arrival' ok from stays where hold_label='Calum';
set request.uid = '00000000-0000-0000-0000-000000000002'; -- Eshcol
insert into stays(room_id,hold_label,arrival,departure) values ('x-monadh','Mrs Direct','2027-03-10','2027-03-17');
select 'T21 Eshcol''s own extra booking is private: activity hidden from RJ McLeod, no alert to their' t,
  (select bool_and(manager_only) from activity where entity_id = (select id::text from stays where hold_label='Mrs Direct'))
  and not exists (select 1 from alert_outbox where recipient_id='00000000-0000-0000-0000-000000000001' and body like '%Mrs Direct%') ok;
select 'T21a whole-property price: Monadh 2 bedrooms x £350 = £700 a week' t, indicative_price('x-monadh','2027-03-10','2027-03-17') like 'Indicative £700 for 7 nights%' ok;
set request.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin insert into stays(room_id,hold_label,arrival,departure) values ('x-monadh','Crew','2027-03-15','2027-03-20'); raise notice 'FAIL double booking allowed';
exception when others then if sqlerrm like '%Direct%' then raise notice 'FAIL clash message names a guest'; else raise notice 'PASS taken dates blocked without naming anyone: %', sqlerrm; end if; end $$;
do $$ begin update stays set version = version, notes = 'x' where hold_label='Mrs Direct'; raise notice 'FAIL client edited Eshcol''s extra'; exception when others then raise notice 'PASS Eshcol''s extra bookings locked for RJ McLeod: %', sqlerrm; end $$;
insert into stays(room_id,worker_id,hold_label,arrival,departure) values ('lr-5',null,'Contract','2027-03-01','2027-03-03');
select 'T23 contract rooms book as before' t, count(*) = 1 ok from stays where hold_label='Contract';
-- feed + blocks (as the sync would write them)
-- one feed row per extra unit, naming a secret (no URLs in the database)
select 'T24a a feed row per extra unit, each naming an ICAL_ secret, none linked yet' t, count(*) = 4 and bool_and(env_key ~ '^ICAL_') and not bool_or(linked) ok from ical_feeds;
select 'T24b feeds have no url column' t, not exists (select 1 from information_schema.columns where table_name='ical_feeds' and column_name='url') ok;
do $$ begin insert into ical_feeds(room_id,label,env_key) values ('lr-1','x','SUPABASE_SERVICE_ROLE_KEY'); raise notice 'FAIL feed may name a non-ICAL secret'; exception when others then raise notice 'PASS feeds can only name ICAL_* secrets: %', sqlerrm; end $$;
-- row-level security only applies to non-superusers: check it as an ordinary signed-in role
do $$ begin if not exists (select 1 from pg_roles where rolname = 'rb_rls_probe') then create role rb_rls_probe; end if; end $$;
grant usage on schema public to rb_rls_probe; grant select, update on ical_feeds to rb_rls_probe; grant select on profiles to rb_rls_probe;
grant execute on all functions in schema public to rb_rls_probe; grant usage on schema auth to rb_rls_probe; grant execute on all functions in schema auth to rb_rls_probe;
set role rb_rls_probe;
set request.uid = '00000000-0000-0000-0000-000000000001'; -- RJ McLeod
select 'T24c RJ McLeod cannot see the calendar settings' t, count(*) = 0 ok from ical_feeds;
set request.uid = '00000000-0000-0000-0000-000000000002'; -- Eshcol
select 'T24d Eshcol sees each calendar''s status' t, count(*) = 4 ok from ical_feeds;
do $$ begin update ical_feeds set env_key = 'ICAL_OTHER' where room_id = 'x-pod1'; if found then raise notice 'FAIL Eshcol changed a feed row from the app'; else raise notice 'PASS feed rows are written by the sync only'; end if; exception when others then raise notice 'PASS feed rows are written by the sync only: %', sqlerrm; end $$;
reset role;
set request.uid = ''; -- the sync runs as the service role, not as a person
update ical_feeds set label = 'Airbnb' where room_id = 'x-pod1';
select replace_ical_blocks((select id from ical_feeds where label='Airbnb'), '[{"from":"2027-03-03","to":"2027-03-06"},{"from":"2027-04-10","to":"2027-04-12"}]') as clashes \gset
select 'T24 blocks stored, dates only' t, count(*) = 2 ok from ical_blocks where room_id='x-pod1';
select 'T25 double booking flagged once' t, :clashes = 1 ok;
select 'T26 Eshcol alerted: possible double booking' t, count(*) > 0 ok from alert_outbox where subject like '⚠ Possible double booking%';
select replace_ical_blocks((select id from ical_feeds where label='Airbnb'), '[{"from":"2027-03-03","to":"2027-03-06"},{"from":"2027-04-10","to":"2027-04-12"}]');
select 'T27 re-sync does not re-alert' t, count(*) = 1 ok from alert_outbox where subject like '⚠ Possible double booking%';
select replace_ical_blocks((select id from ical_feeds where label='Airbnb'), null, 'HTTP 404');
select 'T28 failed read keeps old blocks + records error' t, (select count(*) from ical_blocks where room_id='x-pod1') = 2 and last_error is not null ok from ical_feeds where label='Airbnb';
select 'T28a a linked feed reads as linked' t, linked ok from ical_feeds where label='Airbnb';
select replace_ical_blocks((select id from ical_feeds where room_id='x-cottage'), null);
select 'T28b no secret set = not linked yet: no blocks, no error' t, not linked and last_error is null and not exists (select 1 from ical_blocks where room_id='x-cottage') ok from ical_feeds where room_id='x-cottage';
set request.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin insert into stays(room_id,hold_label,arrival,departure) values ('x-pod1','Late','2027-04-09','2027-04-11'); raise notice 'FAIL booked-elsewhere not blocked'; exception when others then raise notice 'PASS booked-elsewhere dates blocked: %', sqlerrm; end $$;
insert into stays(room_id,hold_label,arrival,departure) values ('x-pod2','Ewan','2027-05-01','2027-05-03');
set request.uid = '00000000-0000-0000-0000-000000000002';
insert into stays(room_id,hold_label,arrival,departure) values ('x-cottage','Direct guest','2027-05-01','2027-05-08');
select 'T29 Eshcol books extras directly' t, count(*) = 1 ok from stays where hold_label='Direct guest';
set request.uid = '00000000-0000-0000-0000-000000000001';
delete from stays where hold_label='Ewan';
select 'T30 RJ McLeod can cancel their own extra booking' t, count(*) = 0 ok from stays where hold_label='Ewan';
select 'T31 double-booking log is Eshcol-only and names no booking site' t, bool_and(manager_only) and not bool_or(text like '%Airbnb%') ok from activity where text like '⚠ Possible double booking%';
-- RLS as an ordinary signed-in role: settings, activity, others' extra bookings
grant select, update on app_settings to rb_rls_probe; grant select on app_settings_history to rb_rls_probe; grant select on activity, stays to rb_rls_probe;
set role rb_rls_probe;
set request.uid = '00000000-0000-0000-0000-000000000001'; -- RJ McLeod
select 'T34 RJ McLeod reads the rate' t, (value #>> '{}')::int = 350 ok from app_settings where key = 'rate_per_room_week';
update app_settings set value = '1' where key = 'rate_per_room_week';
select 'T35 RJ McLeod cannot change the rate' t, (value #>> '{}')::int = 350 ok from app_settings where key = 'rate_per_room_week';
select 'T36 RJ McLeod sees no Eshcol-only activity' t, count(*) = 0 ok from activity where manager_only;
select 'T37 RJ McLeod cannot read Eshcol''s extra bookings (dates only via extra_taken)' t, count(*) = 0 ok from stays where hold_label in ('Mrs Direct','Direct guest');
select 'T37a RJ McLeod reads their own extra booking' t, count(*) = 1 ok from stays where hold_label = 'Calum';
set request.uid = '00000000-0000-0000-0000-000000000002'; -- Eshcol
update app_settings set value = '400' where key = 'rate_per_room_week';
select 'T38 Eshcol changes the rate' t, (value #>> '{}')::int = 400 ok from app_settings where key = 'rate_per_room_week';
select 'T38a rate history: who, old and new, Eshcol can read it' t, count(*) = 1 ok from app_settings_history
  where old_value = '350' and new_value = '400' and changed_by = '00000000-0000-0000-0000-000000000002';
set request.uid = '00000000-0000-0000-0000-000000000001';
select 'T38b RJ McLeod cannot read the rate history' t, count(*) = 0 ok from app_settings_history;
reset role;
select 'T39 prices follow the rate (Abhainn 2 rooms charged x £400, 7 nights = £800)' t, indicative_price('x-cottage','2027-06-01','2027-06-08') like 'Indicative £800 for 7 nights%' ok;
set request.uid = '00000000-0000-0000-0000-000000000001';
select 'T32 extra_taken gives RJ McLeod dates without names' t, count(*) = 1 ok from extra_taken() where room_id = 'x-cottage' and start_date = '2027-05-01';
select 'T33 export tokens for every extra unit' t, count(*) = 4 ok from ical_exports;
-- open-ended (until further notice) extra bookings
set request.uid = '00000000-0000-0000-0000-000000000001'; -- RJ McLeod
insert into stays(room_id,hold_label,arrival,departure,dep_status) values ('x-pod2','Long stay','2027-07-01',null,'ufn');
select 'T40 RJ McLeod books an extra open-ended (until further notice)' t, count(*) = 1 ok from stays where hold_label='Long stay' and departure is null;
do $$ begin insert into stays(room_id,hold_label,arrival,departure) values ('x-pod2','Later','2027-09-01','2027-09-03'); raise notice 'FAIL open-ended booking did not block later dates'; exception when others then raise notice 'PASS open-ended booking blocks every later night: %', sqlerrm; end $$;
do $$ begin insert into stays(room_id,hold_label,arrival,departure,dep_status) values ('x-pod1','Open clash','2027-03-20',null,'ufn'); raise notice 'FAIL open-ended over a later calendar block allowed'; exception when others then raise notice 'PASS open-ended refused when a later night is booked elsewhere: %', sqlerrm; end $$;
select 'T41 open-ended price is weekly, until further notice' t, indicative_price('x-pod2','2027-07-01',null) = 'Indicative £400 per week, until further notice' ok;
select 'T42 Eshcol alerted it is open-ended' t, count(*) = 1 ok from alert_outbox where subject like 'New booking%' and body like '%Uig%until further notice%';
update stays set departure = '2027-07-15', dep_status = 'planned' where hold_label='Long stay';
select 'T43 RJ McLeod sets the end date later' t, departure = '2027-07-15' ok from stays where hold_label='Long stay';
insert into stays(room_id,hold_label,arrival,departure) values ('x-pod2','Later','2027-09-01','2027-09-03');
select 'T44 after the end date the nights are free again' t, count(*) = 1 ok from stays where hold_label='Later';
-- regression 18 Oct 2026: set the end date of an open-ended contract stay (the row the app sends: date + planned)
set request.uid = '00000000-0000-0000-0000-000000000001'; -- RJ McLeod
insert into stays(room_id,worker_id,hold_label,arrival,departure,dep_status) values ('lr-5',null,'Open contract','2027-08-01',null,'ufn');
do $$ begin insert into stays(room_id,hold_label,arrival,departure) values ('lr-5','After','2027-08-20','2027-08-22'); raise notice 'FAIL open-ended contract stay did not block'; exception when others then raise notice 'PASS open-ended contract stay blocks later nights: %', sqlerrm; end $$;
update stays set departure = '2027-08-10', dep_status = 'planned' where hold_label='Open contract';
select 'T45 end date set on an open-ended contract stay' t, departure = '2027-08-10' and dep_status = 'planned' ok from stays where hold_label='Open contract';
update stays set departure = '2027-08-11', dep_status = 'ufn' where hold_label='Open contract';
select 'T45a a date sent with an open status is kept, as a planned end date' t, departure = '2027-08-11' and dep_status = 'planned' ok from stays where hold_label='Open contract';
insert into stays(room_id,hold_label,arrival,departure) values ('lr-5','After','2027-08-20','2027-08-22');
select 'T46 nights after the new end date are free' t, count(*) = 1 ok from stays where hold_label='After';
-- block contract (Eshcol, Loch Roag): never a price, anywhere; driven by properties.contracted
reset role;
select 'T47 no price for a contract room' t, indicative_price('es-1','2027-03-01','2027-03-04') is null and indicative_price('lr-5','2027-03-01',null) is null ok;
select 'T48 no £ in any alert about a contract booking' t, count(*) = 0 ok from alert_outbox where (subject || body) like '%£%' and (subject || body) ~ '(Eshcol|Loch Roag)';
select 'T49 no £ in any activity line about a contract booking' t, count(*) = 0 ok from activity where text like '%£%' and text ~ '(Eshcol|Loch Roag)';
select 'T49a the contract alerts were checked (there are some)' t, count(*) > 0 ok from alert_outbox where (subject || body) ~ '(Eshcol|Loch Roag)';
update properties set contracted = false where id = 'p-lr';
select 'T50 switching the flag is all it takes: Loch Roag off the contract gets a price' t, indicative_price('lr-1','2027-03-01','2027-03-08') like 'Indicative £%' ok;
update properties set contracted = true where id = 'p-lr';
select 'T50a and back on the contract: no price again' t, indicative_price('lr-1','2027-03-01','2027-03-08') is null ok;
