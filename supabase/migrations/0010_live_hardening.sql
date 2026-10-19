-- 0010 (19 Oct 2026): first live load (project roomboard, London). Three fixes found on the real database.
-- 1. Supabase grants EXECUTE on every new function to anon and authenticated, so the SECURITY DEFINER helpers were
--    callable through /rest/v1/rpc by anyone holding the public anon key (e.g. enqueue_role could queue an email,
--    replace_ical_blocks could wipe a calendar). Lock them to what the app actually calls.
-- 2. 0008's upserts kept 0004's sort order and check-in times; set the confirmed values (order: Eshcol, Loch Roag,
--    Harris, Uig, Monadh, Abhainn Cottage).
-- 3. 0005's dispatch-alerts job used a placeholder URL; read the URL and key from Vault like ical-sync (0008).
--    dispatch-alerts still sends nothing until app_settings 'notifications_live' is true.

-- ---------- 1. function permissions ----------
do $$
declare f record;
  -- RLS policies use these, so every role keeps them (they reveal nothing on their own)
  everyone text[] := array['my_role', 'is_extra'];
  -- called by the app (rpc) or from apply_series, which runs as the signed-in user
  signed_in text[] := array['extra_taken', 'dismiss_changeover', 'indicative_price', 'log_activity', 'alert_stay_change'];
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then return; end if;  -- plain Postgres (qa/sql.sh)
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname = any(everyone) then execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.proname = any(signed_in) then execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------- 2. confirmed order and times ----------
update properties p set sort = v.sort, checkin_time = v.cin::time, checkout_time = v.cout::time
from (values ('p-es', 1, '15:00', '10:00'), ('p-lr', 2, '15:00', '10:00'), ('p-pod1', 3, '16:00', '10:00'),
             ('p-pod2', 4, '16:00', '10:00'), ('p-monadh', 5, '16:00', '10:00'), ('p-cottage', 6, '15:00', '10:00'))
  v(id, sort, cin, cout) where p.id = v.id;
update units u set sort = v.sort from (values ('un-es-main', 1), ('un-es-flat', 2), ('un-lr-up', 3), ('un-lr-down', 4),
  ('un-pod1', 5), ('un-pod2', 6), ('un-monadh', 7), ('un-cottage', 8)) v(id, sort) where u.id = v.id;
update rooms set sort = 10 + split_part(id, '-', 2)::int where property_id = 'p-lr';
update rooms set sort = split_part(id, '-', 2)::int where property_id = 'p-es';

-- ---------- 3. alert dispatcher from Vault ----------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dispatch-alerts', '* * * * *', $c$
      select net.http_post(
        (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/dispatch-alerts',
        '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')))
    $c$);
  end if;
end $$;
