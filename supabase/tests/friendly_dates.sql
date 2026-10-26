-- 0014: activity, red-dot and email text gets friendly dates; Abhainn's short name. Rolls itself back.
-- Run: psql -X -At -f supabase/tests/friendly_dates.sql
begin;
select 'D1 this year drops the year: ' || (rb_d('2026-11-06', '2026-10-26') = '6 Nov') || ' (' || rb_d('2026-11-06', '2026-10-26') || ')';
select 'D2 other year keeps it: ' || (rb_d('2027-01-04', '2026-10-26') = '4 Jan 2027');
select 'D3 text rewritten: ' || (rb_dates('Room 3: arrival 2026-11-02 → 2027-01-04, Thu 05 Nov', '2026-10-26')
  = 'Room 3: arrival 2 Nov → 4 Jan 2027, Thu 5 Nov');
select 'D4 non-dates untouched: ' || (rb_dates('ref 2026-13-40 and 12026-11-06x, Mon 12 Nov', '2026-10-26') = 'ref 2026-13-40 and 12026-11-06x, Mon 12 Nov');
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','d1@invalid'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','d2@invalid');
insert into profiles (id, full_name, role, email) values ('aaaaaaaa-0000-0000-0000-0000000000d1','RJ McLeod','client','x@invalid'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2','Eshcol','manager','y@invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000d1","role":"authenticated"}', true) is not null;
insert into stays (id, room_id, hold_label, arrival, departure, dep_status) values ('00000000-0000-0000-0000-0000000000d9', 'es-2', 'Date test', london_today() + 3, london_today() + 9, 'planned');
update stays set departure = london_today() + 8 where id = '00000000-0000-0000-0000-0000000000d9';
update stays set arrival = london_today() + 400 - 1, departure = london_today() + 400 where id = '00000000-0000-0000-0000-0000000000d9';
reset role;
create temp table d_act on commit drop as select text from activity where entity_id = '00000000-0000-0000-0000-0000000000d9';
select 'D5 client change logged with no ISO date: ' || (count(*) >= 3 and bool_and(text !~ '[0-9]{4}-[0-9]{2}-[0-9]{2}')) from d_act;
select 'D6 departure shown friendly: ' || exists (select 1 from d_act where text like '%departure ' || rb_d(london_today() + 8) || '%');
select 'D7 next year carries its year: ' || exists (select 1 from d_act where text like '%' || extract(year from london_today() + 400)::text || '%');
select 'D8 red dot and email friendly too: ' || (not exists (select 1 from notifications where text ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}')
  and not exists (select 1 from alert_outbox where body ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}' or subject ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}'))
  || ' (' || (select count(*) from notifications where stay_id = '00000000-0000-0000-0000-0000000000d9') || ' red dots)';
select 'D9 Abhainn: ' || ((select name = 'Abhainn' and short_name = 'Abhainn' and details::text not like '%Abhainn Cottage%' from properties where id = 'p-cottage')
  and (select name = 'Abhainn' from units where id = 'un-cottage') and (select label = 'Abhainn calendar' from ical_feeds where room_id = 'x-cottage'));
select 'D10 helpers not callable by anon or signed-in users: ' || (not has_function_privilege('anon', 'rb_dates(text, date)', 'execute')
  and not has_function_privilege('authenticated', 'rb_dates(text, date)', 'execute')
  and not has_function_privilege('anon', 'rb_friendly_text()', 'execute') and not has_function_privilege('anon', 'rb_d(date, date)', 'execute'));
rollback;
