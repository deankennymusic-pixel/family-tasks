#!/usr/bin/env bash
# Runs the migrations and the row level security tests against Postgres.
#
# Uses $TEST_DATABASE_URL when set (it must point at an empty, disposable
# database). Otherwise starts a throwaway local Postgres cluster.
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() { :; }
trap 'cleanup' EXIT

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [[ -x "$PG_BIN/initdb" ]] || { echo "Postgres not found; set TEST_DATABASE_URL or PG_BIN" >&2; exit 1; }
  TMP="$(mktemp -d)"
  "$PG_BIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
  "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
  cleanup() { "$PG_BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
  TEST_DATABASE_URL="postgresql://postgres@/postgres?host=$TMP"
fi

run() { psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

run -f tests/db/supabase-stub.sql >/dev/null
for f in supabase/migrations/*.sql; do run -f "$f" >/dev/null; done
run -f tests/db/rls.test.sql
