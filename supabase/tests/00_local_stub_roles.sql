-- Local stand-in for Supabase roles, auth helpers and default grants, so the live-safe RLS / flow checks
-- (live_rls.sql, live_flow.sql) can run on a plain Postgres. Used by qa/sql-rls.sh only; never applied to a project.
do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth; create table auth.users(id uuid primary key, instance_id uuid, aud text, role text, email text);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.uid', true),''), nullif(current_setting('request.jwt.claims', true),'')::json->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims', true),'')::json->>'role' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated;
grant usage on schema public to anon, authenticated, service_role;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
