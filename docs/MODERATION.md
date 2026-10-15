# Moderation

A moderator can list runs and users, take a run off the leaderboard, delete a run and mark a
user for review. There is no web interface yet; the actions are API calls with the bearer
token of an admin (`curl`, or any HTTP client).

## Becoming an admin

The admin flag is only ever set on the server, with the command line, so a username that
nobody registered yet can never be claimed into the role:

```sh
podman compose exec backend python -m trust_issues_backend.admin_cli grant <username>
podman compose exec backend python -m trust_issues_backend.admin_cli revoke <username>
```

The flag is read from the database on every request, so `revoke` takes effect for tokens
that were already issued.

## Actions

All paths are under `/api/admin`, need an admin token (401 without a token, 403 for a user
that is not an admin) and answer 204 when they changed something.

| Method | Path                 | Does                                                                                          |
| ------ | -------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/runs`              | Best runs, newest first. `?level_id=`, `?flagged=true` (verifier flags only), `?limit=1..500` |
| GET    | `/users`             | Users, newest first. `?flagged=true`, `?limit=1..500`                                         |
| POST   | `/runs/{id}/hide`    | Takes the run off the leaderboard and out of the rank of others                               |
| POST   | `/runs/{id}/unhide`  | Puts it back                                                                                  |
| POST   | `/runs/{id}/delete`  | Removes the run; the player has to complete the level again                                   |
| POST   | `/users/{id}/flag`   | Marks a user for review, changes nothing for the player                                       |
| POST   | `/users/{id}/unflag` | Clears the mark                                                                               |

Every POST takes a JSON object with an optional `reason` of at most 200 characters, for
example `{"reason": "inhuman input pattern"}`.

A hidden run stays hidden when the player later submits a better run on the same level, so a
cheater cannot undo the decision by playing again. The player keeps the level as completed
and keeps progressing.

## What a moderator sees

`GET /runs` lists the verifier's plausibility flags (see
[ANTI_CHEAT.md](ANTI_CHEAT.md#plausibility-flags)) next to score, frames, deaths and the
versions the run was verified against. It does not return the replay.

## Audit trail

Each action is written to the audit log in the same transaction as the change, with the
kind (`moderation_hide`, `moderation_unhide`, `moderation_delete`, `moderation_flag_user`,
`moderation_unflag_user`), the moderator, the affected user, the level and the reason. They
are kept for `AUDIT_RETENTION_DAYS` like every other event. Deleting an account detaches the
user id of its events.
