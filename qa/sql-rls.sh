#!/usr/bin/env bash
# Local RLS + flow checks: fresh database with Supabase-like roles and grants, ALL migrations (except pg_cron),
# a sample Monadh calendar block, then the live-safe scripts (each rolls itself back and prints its results).
set -uo pipefail
cd "$(dirname "$0")/.."
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-5433} PGDATABASE=rb_rls PGUSER=${PGUSER:-postgres} PGOPTIONS="-c client_min_messages=warning"
dropdb --if-exists rb_rls && createdb rb_rls || exit 1
for f in supabase/tests/00_local_stub_roles.sql supabase/migrations/00{01,02,03,04,06,07,08,09,10,11,12,13,14}_*.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAIL applying $f"; exit 1; }
done
psql -X -q -c "insert into ical_blocks(feed_id, room_id, start_date, end_date) select id, room_id, '2026-11-16', '2026-11-19' from ical_feeds where room_id = 'x-monadh'"
out=$( (psql -X -At -f supabase/tests/live_rls.sql; psql -X -At -f supabase/tests/live_flow.sql; psql -X -At -f supabase/tests/stale_edit.sql; psql -X -At -f supabase/tests/friendly_dates.sql) 2>&1 | grep -E '^[ACDHMFXS][0-9]+ ')
echo "$out"
# every friendly-dates line must print (an SQL error part-way would otherwise hide the rest)
[ "$(grep -c '^D[0-9]' <<<"$out")" -eq 10 ] || { echo "FAIL friendly_dates.sql stopped early"; exit 1; }
! grep -qE 'FAIL|: f( |$)' <<<"$out"
