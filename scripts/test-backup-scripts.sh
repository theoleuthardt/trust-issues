#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
bin="$work/bin"
mkdir -p "$bin" "$work/backups"

cat > "$bin/pg_dump" <<'STUB'
#!/usr/bin/env bash
if [ "${STUB_EMPTY_DUMP:-}" = "1" ]; then exit 0; fi
printf 'PGDMP-%s\n' "$*"
STUB
cat > "$bin/pg_restore" <<'STUB'
#!/usr/bin/env bash
cat > /dev/null
if [ "${STUB_UNREADABLE:-}" = "1" ] && [ "${1:-}" = "--list" ]; then exit 1; fi
if [ "${STUB_RESTORE_FAILS:-}" = "1" ] && [ "${1:-}" != "--list" ]; then exit 1; fi
exit 0
STUB
cat > "$bin/createdb" <<'STUB'
#!/usr/bin/env bash
echo "createdb $*" >> "$STUB_LOG"
STUB
cat > "$bin/dropdb" <<'STUB'
#!/usr/bin/env bash
echo "dropdb $*" >> "$STUB_LOG"
STUB
cat > "$bin/psql" <<'STUB'
#!/usr/bin/env bash
echo 3
STUB
chmod +x "$bin"/*

export PATH="$bin:$PATH"
export DB_EXEC=""
export BACKUP_DIR="$work/backups"
export STUB_LOG="$work/log"
: > "$STUB_LOG"
failures=0

check() {
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3: expected '$2', got '$1'"; failures=$((failures + 1)); fi
}

dumps() { find "$BACKUP_DIR" -name 'trustissues-*.dump' | wc -l | tr -d ' '; }
leftovers() { find "$BACKUP_DIR" -name '*.partial' | wc -l | tr -d ' '; }

"$root/scripts/backup-db.sh" > /dev/null
check "$(dumps)" 1 "a backup writes one dump"
check "$(leftovers)" 0 "no partial file stays behind"

touch -d '30 days ago' "$BACKUP_DIR/trustissues-20200101T000000Z.dump"
touch -d '2 days ago' "$BACKUP_DIR/trustissues-20990101T000000Z.dump"
"$root/scripts/backup-db.sh" > /dev/null
check "$(ls "$BACKUP_DIR" | grep -c 20200101)" 0 "a dump older than the retention is removed"
check "$(ls "$BACKUP_DIR" | grep -c 20990101)" 1 "a recent dump is kept"

before="$(dumps)"
if STUB_EMPTY_DUMP=1 "$root/scripts/backup-db.sh" > /dev/null 2>&1; then
  check "succeeded" "failed" "an empty dump fails the backup"
else
  check "failed" "failed" "an empty dump fails the backup"
fi
check "$(dumps)" "$before" "an empty dump leaves no file"
check "$(leftovers)" 0 "an empty dump leaves no partial file"

if STUB_UNREADABLE=1 "$root/scripts/backup-db.sh" > /dev/null 2>&1; then
  check "succeeded" "failed" "an unreadable dump fails the backup"
else
  check "failed" "failed" "an unreadable dump fails the backup"
fi
check "$(dumps)" "$before" "an unreadable dump is not kept"

: > "$STUB_LOG"
output="$("$root/scripts/restore-test.sh")"
check "$(echo "$output" | grep -c '3 users')" 1 "the restore test reports the restored rows"
check "$(grep -c '^createdb' "$STUB_LOG")" 1 "the restore test creates a scratch database"
check "$(grep -c '^dropdb' "$STUB_LOG")" 1 "the restore test drops the scratch database"

: > "$STUB_LOG"
if STUB_RESTORE_FAILS=1 "$root/scripts/restore-test.sh" > /dev/null 2>&1; then
  check "succeeded" "failed" "a failing restore fails the test"
else
  check "failed" "failed" "a failing restore fails the test"
fi
check "$(grep -c '^dropdb' "$STUB_LOG")" 1 "the scratch database is dropped after a failure"

rm -f "$BACKUP_DIR"/*.dump
if "$root/scripts/restore-test.sh" > /dev/null 2>&1; then
  check "succeeded" "failed" "no backup fails the restore test"
else
  check "failed" "failed" "no backup fails the restore test"
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
