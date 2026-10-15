#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

cat > "$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
url="${*: -1}"
echo "$url" >> "$STUB_LOG"
case "$url" in
  *ping*) [ "${STUB_PING_FAILS:-}" = "1" ] && exit 22; exit 0 ;;
esac
case "${STUB_MODE:-ok}" in
  ok) echo '{"status":"ok"}' ;;
  spaced) echo '{"status": "ok"}' ;;
  down) exit 7 ;;
  wrong) echo '{"status":"degraded"}' ;;
  html) echo '<html>502</html>' ;;
esac
STUB
chmod +x "$work/bin/curl"
export PATH="$work/bin:$PATH"
export STUB_LOG="$work/log"
: > "$STUB_LOG"
failures=0

expect() {
  local want="$1" label="$2"
  shift 2
  local got=succeeded
  "$@" > /dev/null 2>&1 || got=failed
  if [ "$got" = "$want" ]; then echo "ok   $label"; else echo "FAIL $label: $got"; failures=$((failures + 1)); fi
}

expect succeeded "a healthy answer passes" env STUB_MODE=ok "$root/scripts/check-health.sh"
expect succeeded "an answer with a space after the colon passes" env STUB_MODE=spaced "$root/scripts/check-health.sh"
expect failed "an unreachable service fails" env STUB_MODE=down "$root/scripts/check-health.sh"
expect failed "another status fails" env STUB_MODE=wrong "$root/scripts/check-health.sh"
expect failed "an error page fails" env STUB_MODE=html "$root/scripts/check-health.sh"

: > "$STUB_LOG"
env STUB_MODE=ok HEALTH_PING_URL=https://ping.example/ok "$root/scripts/check-health.sh" > /dev/null
expect_count="$(grep -c 'ping.example' "$STUB_LOG" || true)"
if [ "$expect_count" = 1 ]; then echo "ok   a healthy check pings the dead man's switch"; else echo "FAIL ping count $expect_count"; failures=$((failures + 1)); fi

: > "$STUB_LOG"
env STUB_MODE=down HEALTH_PING_URL=https://ping.example/ok "$root/scripts/check-health.sh" > /dev/null 2>&1 || true
expect_count="$(grep -c 'ping.example' "$STUB_LOG" || true)"
if [ "$expect_count" = 0 ]; then echo "ok   an unhealthy check does not ping"; else echo "FAIL ping count $expect_count"; failures=$((failures + 1)); fi

expect succeeded "a failing ping does not fail a healthy check" env STUB_MODE=ok STUB_PING_FAILS=1 HEALTH_PING_URL=https://ping.example/ok "$root/scripts/check-health.sh"

if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
