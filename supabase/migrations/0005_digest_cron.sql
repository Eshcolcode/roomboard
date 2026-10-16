-- 7:00 Europe/London digest + alert dispatcher. Needs pg_cron and pg_net (enable in Dashboard → Database → Extensions).
-- pg_cron runs in UTC, so schedule both 06:00 and 07:00 UTC; the function exits unless London local hour = 7.
create extension if not exists pg_cron; create extension if not exists pg_net;
create or replace function queue_digest() returns void language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/London')::date; body text;
begin
  if extract(hour from now() at time zone 'Europe/London') <> 7 then return; end if;
  body := 'Departures: ' || coalesce((select string_agg(room_label(room_id) || ' ' || stay_label(s) || case when dep_status='planned' then ' (planned)' else '' end, '; ') from stays s where departure = today), 'none')
    || E'\nArrivals: ' || coalesce((select string_agg(room_label(room_id) || ' ' || stay_label(s), '; ') from stays s where arrival = today), 'none')
    || E'\nOpen changeovers: ' || (select count(*) from changeovers where status <> 'ready');
  insert into alert_outbox (recipient_id, recipient, channel, subject, body) select id, email, 'email', 'Roomboard morning digest · ' || to_char(today,'Dy DD Mon'), body from profiles;
end $$;
select cron.schedule('digest-06utc', '0 6 * * *', 'select queue_digest()');
select cron.schedule('digest-07utc', '0 7 * * *', 'select queue_digest()');
-- Every minute, call the dispatcher edge function (it sends queued alerts and retries with backoff).
-- Replace <project-ref> and <service-role-key> via Vault in production.
select cron.schedule('dispatch-alerts', '* * * * *', $$ select net.http_post('https://<project-ref>.functions.supabase.co/dispatch-alerts', '{}'::jsonb, headers := jsonb_build_object('Authorization','Bearer <service-role-key>')) $$);
