#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DIR:=./backups}"
: "${DB_EXEC=podman compose exec -T db}"
: "${DB_USER:=trust}"

latest="$(ls -1t "$BACKUP_DIR"/trustissues-*.dump 2>/dev/null | head -n 1 || true)"
if [ -z "$latest" ]; then
  echo "restore test failed: no backup in $BACKUP_DIR" >&2
  exit 1
fi

scratch="restore_test_$(date -u +%Y%m%d%H%M%S)_$$_$RANDOM"
created=0
cleanup() {
  if [ "$created" = 1 ]; then
    $DB_EXEC dropdb -U "$DB_USER" --if-exists "$scratch" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

$DB_EXEC createdb -U "$DB_USER" "$scratch"
created=1
$DB_EXEC pg_restore -U "$DB_USER" -d "$scratch" --no-owner --exit-on-error < "$latest"
users="$($DB_EXEC psql -U "$DB_USER" -d "$scratch" -tAc 'SELECT count(*) FROM users')"
runs="$($DB_EXEC psql -U "$DB_USER" -d "$scratch" -tAc 'SELECT count(*) FROM best_runs')"
echo "restored $latest into $scratch: $users users, $runs best runs"
