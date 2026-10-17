-- Local smoke test (plain Postgres + 00_local_stub.sql). Mirrors the demo checks.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into profiles (id,full_name,role,email,phone) values ('00000000-0000-0000-0000-000000000001','Sheena','client','',null),('00000000-0000-0000-0000-000000000002','Donald','manager','d@x',null),('00000000-0000-0000-0000-000000000003','Mairi','cleaner','m@x',null);
insert into workers(id,name) values ('00000000-0000-0000-0000-0000000000a1','Neil'),('00000000-0000-0000-0000-0000000000a2','Iain'),('00000000-0000-0000-0000-0000000000a3','Daniel');
set request.uid = '00000000-0000-0000-0000-000000000001'; -- Sheena
insert into stays(room_id,worker_id,arrival,departure,dep_status) values ('lr-8','00000000-0000-0000-0000-0000000000a1','2026-10-02','2026-10-16','confirmed');
insert into stays(room_id,hold_label,arrival,dep_status) values ('lr-8','Name to follow','2026-10-20','tbc');
select 'T1 changeover created' t, count(*) = 1 ok from changeovers where room_id='lr-8';
select 'T2 provider alerted for client edit' t, count(*) > 0 ok from alert_outbox o join profiles p on p.id=o.recipient_id where p.role='manager';
select 'T3 client not alerted for own edit' t, count(*) = 0 ok from alert_outbox o where recipient_id='00000000-0000-0000-0000-000000000001';
set request.uid = '00000000-0000-0000-0000-000000000002'; -- Donald
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
-- extras: requests, answers, iCal blocks (0008)
set request.uid = '00000000-0000-0000-0000-000000000001'; -- Sheena
insert into stays(room_id,hold_label,arrival,departure) values ('x-pod1','Calum','2027-03-01','2027-03-04');
select 'T17 client booking of an extra is a pending request' t, request = 'pending' ok from stays where room_id='x-pod1' and hold_label='Calum';
select 'T18 Donald alerted: New request' t, count(*) > 0 ok from alert_outbox where subject like 'New request%' and recipient_id='00000000-0000-0000-0000-000000000002';
select 'T19 extras make no changeovers' t, count(*) = 0 ok from changeovers where room_id like 'x-%';
update stays set version = version, request = null where room_id='x-pod1' and hold_label='Calum';
select 'T20 client cannot confirm their own request' t, request = 'pending' ok from stays where room_id='x-pod1' and hold_label='Calum';
do $$ begin perform answer_request((select id from stays where hold_label='Calum'), true); raise notice 'FAIL client answered'; exception when others then raise notice 'PASS only Donald answers requests: %', sqlerrm; end $$;
set request.uid = '00000000-0000-0000-0000-000000000002'; -- Donald
select answer_request((select id from stays where hold_label='Calum'), true);
select 'T21 confirm makes it a booking' t, request is null ok from stays where hold_label='Calum';
select 'T22 Sheena told: Request confirmed' t, count(*) > 0 ok from alert_outbox where subject like 'Request confirmed%' and recipient_id='00000000-0000-0000-0000-000000000001';
set request.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin update stays set version = version, notes = 'x' where hold_label='Calum'; raise notice 'FAIL client edited confirmed extra'; exception when others then raise notice 'PASS confirmed extra locked for client: %', sqlerrm; end $$;
insert into stays(room_id,worker_id,hold_label,arrival,departure,request) values ('lr-5',null,'Contract','2027-03-01','2027-03-03','pending');
select 'T23 contract rooms never hold requests' t, request is null ok from stays where hold_label='Contract';
-- feed + blocks (as the sync would write them)
set request.uid = '00000000-0000-0000-0000-000000000002';
insert into ical_feeds(room_id,label,url) values ('x-pod1','Airbnb','https://www.airbnb.co.uk/calendar/ical/1.ics');
set request.uid = ''; -- the sync runs as the service role, not as a person
select replace_ical_blocks((select id from ical_feeds where label='Airbnb'), '[{"from":"2027-03-03","to":"2027-03-06"},{"from":"2027-04-10","to":"2027-04-12"}]') as clashes \gset
select 'T24 blocks stored, dates only' t, count(*) = 2 ok from ical_blocks where room_id='x-pod1';
select 'T25 double booking flagged once' t, :clashes = 1 ok;
select 'T26 Donald alerted: possible double booking' t, count(*) > 0 ok from alert_outbox where subject like '⚠ Possible double booking%';
select replace_ical_blocks((select id from ical_feeds where label='Airbnb'), '[{"from":"2027-03-03","to":"2027-03-06"},{"from":"2027-04-10","to":"2027-04-12"}]');
select 'T27 re-sync does not re-alert' t, count(*) = 1 ok from alert_outbox where subject like '⚠ Possible double booking%';
select replace_ical_blocks((select id from ical_feeds where label='Airbnb'), null, 'HTTP 404');
select 'T28 failed read keeps old blocks + records error' t, (select count(*) from ical_blocks where room_id='x-pod1') = 2 and last_error is not null ok from ical_feeds where label='Airbnb';
set request.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin insert into stays(room_id,hold_label,arrival,departure) values ('x-pod1','Late','2027-04-09','2027-04-11'); raise notice 'FAIL booked-elsewhere not blocked'; exception when others then raise notice 'PASS booked-elsewhere dates blocked: %', sqlerrm; end $$;
insert into stays(room_id,hold_label,arrival,departure) values ('x-pod2','Ewan','2027-05-01','2027-05-03');
set request.uid = '00000000-0000-0000-0000-000000000002';
insert into stays(room_id,hold_label,arrival,departure) values ('x-cottage','Direct guest','2027-05-01','2027-05-08');
select 'T29 Donald books extras directly (no request)' t, request is null ok from stays where hold_label='Direct guest';
select answer_request((select id from stays where hold_label='Ewan'), false, 'Pod closed for repairs');
select 'T30 decline removes the request' t, count(*) = 0 ok from stays where hold_label='Ewan';
select 'T31 Sheena told why' t, count(*) > 0 ok from alert_outbox where subject like 'Request declined%' and body like '%Pod closed for repairs%';
set request.uid = '00000000-0000-0000-0000-000000000001';
select 'T32 extra_taken gives Sheena dates without names' t, count(*) = 1 ok from extra_taken() where room_id = 'x-cottage' and start_date = '2027-05-01';
select 'T33 export tokens for every extra unit' t, count(*) = 5 ok from ical_exports;
