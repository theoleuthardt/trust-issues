#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DIR:=./backups}"
: "${BACKUP_RETENTION_DAYS:=14}"
: "${DB_EXEC=podman compose exec -T db}"
: "${DB_USER:=trust}"
: "${DB_NAME:=trustissues}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/trustissues-$stamp.dump"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

$DB_EXEC pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$partial"

if [ ! -s "$partial" ]; then
  echo "backup failed: the dump is empty" >&2
  exit 1
fi
if ! $DB_EXEC pg_restore --list < "$partial" > /dev/null; then
  echo "backup failed: the dump cannot be read back" >&2
  exit 1
fi

mv "$partial" "$target"
find "$BACKUP_DIR" -name 'trustissues-*.dump' -type f -mtime "+$BACKUP_RETENTION_DAYS" -delete

if [ -n "${BACKUP_PING_URL:-}" ]; then
  curl -fsS -m 10 "$BACKUP_PING_URL" > /dev/null || echo "warning: the ping failed" >&2
fi
echo "$target"
