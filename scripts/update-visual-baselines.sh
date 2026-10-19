#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
target="e2e/tests/visual.spec.ts-snapshots"
branch="update-visual/$(date -u +%Y%m%d%H%M%S)"

git push -q origin "HEAD:refs/heads/$branch"
trap 'git push -q origin --delete "$branch" > /dev/null 2>&1 || true' EXIT

run=""
for _ in $(seq 1 30); do
  run="$(gh run list --workflow visual-baselines.yml --branch "$branch" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$run" ] && break
  sleep 5
done
if [ -z "$run" ]; then
  echo "the baseline workflow did not start for $branch" >&2
  exit 1
fi

gh run watch "$run" --exit-status > /dev/null
rm -rf "$target"
gh run download "$run" --name visual-baselines --dir "$target"
echo "baselines written to $target, review the images and commit them"
