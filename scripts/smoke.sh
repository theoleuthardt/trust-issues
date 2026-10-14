#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do kill -- "-$pid" 2>/dev/null || true; done
  rm -rf "$tmp"
}
trap cleanup EXIT

wait_for() {
  for _ in $(seq 1 60); do
    curl -fsS "$1" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  echo "timed out waiting for $1" >&2
  cat "$tmp"/*.log >&2 || true
  exit 1
}

verifier_token="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
jwt_secret="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"

cd "$root"
replay="$(cd verifier && ../node_modules/.bin/tsx -e "import { SOLUTIONS } from '@trust-issues/sim/testing'; console.log(JSON.stringify(SOLUTIONS['trust-nothing']?.replay))")"

PORT=18081 VERIFIER_TOKEN="$verifier_token" \
  setsid node_modules/.bin/tsx verifier/src/main.ts >"$tmp/verifier.log" 2>&1 &
pids+=($!)
wait_for http://127.0.0.1:18081/health

(
  cd backend
  export DATABASE_URL="sqlite+aiosqlite:///$tmp/smoke.db"
  export JWT_SECRET="$jwt_secret"
  export VERIFIER_URL=http://127.0.0.1:18081
  export VERIFIER_TOKEN="$verifier_token"
  uv run python -m trust_issues_backend.migrate >"$tmp/migrate.log" 2>&1
  exec setsid uv run uvicorn trust_issues_backend.main:app --port 18000 >"$tmp/backend.log" 2>&1
) &
pids+=($!)
wait_for http://127.0.0.1:18000/health

python3 scripts/smoke.py http://127.0.0.1:18000 "$replay"
