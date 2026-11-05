#!/usr/bin/env bash
# Runs the migrations and the SQL tests on a throwaway local Postgres.
set -euo pipefail
cd "$(dirname "$0")/.."

# initdb refuses to run as root: re-run as the postgres account when needed.
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  chmod -R a+rX . 2>/dev/null || true
  exec runuser -u postgres -- bash "$0" "$@"
fi

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$DATA" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f db-tests/stubs.sql
for f in supabase/migrations/*.sql; do
  echo "migrate: $f"
  "${PSQL[@]}" -f "$f"
done
for t in db-tests/test.sql db-tests/test_pantry.sql db-tests/test_upkeep.sql db-tests/test_scans.sql; do  # in order: each builds on the last
  echo "test: $t"
  "${PSQL[@]}" -f "$t"
done
