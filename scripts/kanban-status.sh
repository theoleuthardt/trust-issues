#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <issue-number> <backlog|progress|review|done>" >&2
  exit 1
}

[ $# -eq 2 ] || usage
issue="$1"
status="$2"

case "$status" in
  backlog) option=20952e25 ;;
  progress) option=79730027 ;;
  review) option=6182c40c ;;
  done) option=7c0f2665 ;;
  *) usage ;;
esac

owner=theoleuthardt
repo=trust-issues
project_number=2
project_id=PVT_kwHOA5wDoM4BnFjU
status_field_id=PVTSSF_lAHOA5wDoM4BnFjUzhlrxsI

item_id="$(gh project item-list "$project_number" --owner "$owner" --limit 500 --format json \
  | jq -r --argjson n "$issue" '.items[] | select(.content.number == $n) | .id')"

if [ -z "$item_id" ]; then
  item_id="$(gh project item-add "$project_number" --owner "$owner" \
    --url "https://github.com/$owner/$repo/issues/$issue" --format json | jq -r '.id')"
fi

gh project item-edit --project-id "$project_id" --id "$item_id" \
  --field-id "$status_field_id" --single-select-option-id "$option"
echo "#$issue -> $status"
