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
