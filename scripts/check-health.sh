#!/usr/bin/env bash
set -euo pipefail

: "${HEALTH_URL:=http://127.0.0.1:8000/health}"
: "${HEALTH_TIMEOUT:=10}"

body="$(curl -fsS --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL")" || {
  echo "unhealthy: $HEALTH_URL did not answer" >&2
  exit 1
}

case "$body" in
  *'"status":"ok"'* | *'"status": "ok"'*) ;;
  *)
    echo "unhealthy: unexpected answer from $HEALTH_URL" >&2
    exit 1
    ;;
esac

if [ -n "${HEALTH_PING_URL:-}" ]; then
  curl -fsS --max-time "$HEALTH_TIMEOUT" "$HEALTH_PING_URL" > /dev/null || echo "warning: the ping failed" >&2
fi
echo "healthy: $HEALTH_URL"
