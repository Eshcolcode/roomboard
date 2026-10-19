#!/usr/bin/env bash
# Local SQL tests: fresh database, all migrations (except pg_cron), smoke test, shared rule cases.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-5433} PGDATABASE=rb_test PGUSER=${PGUSER:-postgres}
dropdb --if-exists rb_test && createdb rb_test
for f in supabase/tests/00_local_stub.sql supabase/migrations/000{1,2,3,4,6,7,8,9}_*.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
psql -X -At -f supabase/tests/smoke.sql 2>&1 | grep -E 'PASS|FAIL|\|' | sed -E 's/^(T[0-9]+[^|]*)\|t$/PASS \1/; s/^(T[0-9]+[^|]*)\|f$/FAIL \1/; s/^.*NOTICE: +//' | tee /tmp/sql-smoke.txt
node qa/sql-rules.mjs | tee /tmp/sql-rules.txt
! grep -q FAIL /tmp/sql-smoke.txt
