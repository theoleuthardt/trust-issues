#!/usr/bin/env bash
set -euo pipefail

to="${2:-HEAD}"
from="${1:-}"
if [ -z "$from" ]; then
  from="$(git describe --tags --abbrev=0 "$to^" 2>/dev/null || true)"
fi
range="$to"
if [ -n "$from" ]; then range="$from..$to"; fi

subjects="$(git log --no-merges --pretty=format:%s "$range")"

section() {
  local title="$1" pattern="$2" lines
  lines="$(printf '%s\n' "$subjects" | grep -E "$pattern" || true)"
  if [ -n "$lines" ]; then
    printf '## %s\n\n' "$title"
    printf '%s\n' "$lines" | sed -E 's/^[a-z]+(\([^)]*\))?!?: /- /'
    printf '\n'
  fi
}

section "Features" '^feat(\([^)]*\))?!?: '
section "Fixes" '^fix(\([^)]*\))?!?: '
section "Performance" '^perf(\([^)]*\))?!?: '
section "Documentation" '^docs(\([^)]*\))?!?: '
section "Maintenance" '^(chore|ci|build|test|refactor|style)(\([^)]*\))?!?: '

other="$(printf '%s\n' "$subjects" | grep -Ev '^(feat|fix|perf|docs|chore|ci|build|test|refactor|style)(\([^)]*\))?!?: ' || true)"
if [ -n "$other" ]; then
  printf '## Other\n\n'
  printf '%s\n' "$other" | sed -E 's/^/- /'
  printf '\n'
fi
