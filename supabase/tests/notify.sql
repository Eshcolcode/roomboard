-- 0009 notification tiers (run after smoke-style setup on a fresh database). Prints PASS/FAIL lines.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000012'),('00000000-0000-0000-0000-000000000013');
insert into profiles (id,full_name,role,email,phone) values ('00000000-0000-0000-0000-000000000011','RJ','client','rj@x',null),('00000000-0000-0000-0000-000000000012','Eshcol','manager','e@x',null),('00000000-0000-0000-0000-000000000013','HK','cleaner','h@x',null);
insert into workers(id,name,phone) values ('00000000-0000-0000-0000-0000000000b1','Neil','1');
set request.uid = '00000000-0000-0000-0000-000000000011'; -- RJ McLeod
insert into stays(room_id,worker_id,arrival,departure,dep_status) values ('lr-3','00000000-0000-0000-0000-0000000000b1',london_today()+2,london_today()+30,'planned');
select 'N1 new booking: red dot for Eshcol' t, count(*) = 1 ok from notifications where recipient_id='00000000-0000-0000-0000-000000000012';
select 'N2 new booking in 7 days: housekeeper alerted' t, count(*) = 1 ok from notifications where recipient_id='00000000-0000-0000-0000-000000000013';
select 'N3 activity tagged immediate' t, tier = 'immediate' and kind = 'stay' ok from activity where entity='stay' order by id desc limit 1;
create temp table n0 as select count(*) c from notifications; create temp table o0 as select count(*) c from alert_outbox;
update stays set version = version, notes = 'late key' where room_id='lr-3';
update stays set version = version, worker_id = null, hold_label = 'Swap' where room_id='lr-3';
update workers set phone = '2';
select 'N4 notes / guest swap: no red dot' t, (select count(*) from notifications) = (select c from n0) ok;
select 'N5 notes / guest swap: no email' t, (select count(*) from alert_outbox) = (select c from o0) ok;
select 'N6 activity tagged minor' t, tier = 'minor' ok from activity where entity='stay' order by id desc limit 1;
update stays set version = version, departure = london_today()+40 where room_id='lr-3';
select 'N7 leaving date change: red dot + reason' t, count(*) = 1 ok from notifications where recipient_id='00000000-0000-0000-0000-000000000012' and 'leaving date changed' = any(reasons);
create temp table h0 as select count(*) c from notifications where recipient_id='00000000-0000-0000-0000-000000000013';
insert into stays(room_id,hold_label,arrival,departure,dep_status) values ('lr-6','Far',london_today()+20,london_today()+30,'planned');
update stays set version = version, departure = london_today()+33 where room_id='lr-6' and hold_label='Far';
select 'N8 far-off booking and change: housekeeper not alerted' t, count(*) = (select c from h0) ok from notifications where recipient_id='00000000-0000-0000-0000-000000000013';
select 'N9 email queued but switch is off' t, not notifications_live() ok;
select 'N10 classify end date set' t, rb_change_reasons('UPDATE', '2026-10-01', null, 'lr-1', '2026-10-01', '2026-10-20', 'lr-1', false) = array['end date set'] ok;
select 'N11 classify minor' t, rb_change_tier('UPDATE', '2026-10-01', '2026-10-20', 'lr-1', '2026-10-01', '2026-10-20', 'lr-1') = 'minor' ok;
select 'N12 tier reset after the stay trigger' t, coalesce(current_setting('rb.tier', true), '') = '' ok;
