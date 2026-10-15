#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q
git config user.email ci@example.com
git config user.name ci
failures=0

commit() { git commit -q --allow-empty -m "$1"; }
check() {
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3: expected '$2', got '$1'"; failures=$((failures + 1)); fi
}

commit "feat: first thing"
git tag v0.1.0
commit "feat(sim): fake exits (#26)"
commit "fix(backend): a rare crash (#40)"
commit "docs: explain the thing"
commit "chore(infra): backups (#58)"
commit "test: more tests"
commit "tidy up the readme"

notes="$("$root/scripts/release-notes.sh" v0.1.0 HEAD)"
check "$(echo "$notes" | grep -c '^## Features')" 1 "has a features section"
check "$(echo "$notes" | grep -c -- '- fake exits (#26)')" 1 "strips the type and scope of a feature"
check "$(echo "$notes" | grep -c -- '- a rare crash (#40)')" 1 "lists a fix"
check "$(echo "$notes" | grep -c '^## Maintenance')" 1 "groups chores and tests as maintenance"
check "$(echo "$notes" | grep -c -- '- backups (#58)')" 1 "lists a chore"
check "$(echo "$notes" | grep -c -- '- tidy up the readme')" 1 "keeps a non-conventional subject under other"
check "$(echo "$notes" | grep -c 'first thing')" 0 "leaves out what is before the previous tag"

auto="$("$root/scripts/release-notes.sh" "" HEAD)"
check "$auto" "$notes" "the previous tag is found by itself"

git tag -d v0.1.0 > /dev/null
first="$("$root/scripts/release-notes.sh" "" HEAD)"
check "$(echo "$first" | grep -c 'first thing')" 1 "without any tag everything is included"

if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
