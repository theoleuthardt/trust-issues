# Versioning

A replay is a list of inputs. What it does depends on the simulation rules and on the level
it is played in, so a replay is only meaningful together with the versions it was recorded
with.

## The two versions

| Version       | Where                               | Raised when                                                        |
| ------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `SIM_VERSION` | `packages/sim/src/constants.ts`     | physics, collision, trap behaviour or the replay format change     |
| `revision`    | per level, `LevelDef` (default `1`) | the tiles, traps, spawn, exit or frame budget of that level change |

Raise a version for every change that can make an existing replay end differently. Changes
that cannot (names, comments, par times, rendering) do not need one.

## What carries them

- The client sends `sim_version` and `level_revision` with every run, taken from the build
  it is running. A local best run keeps the versions it was recorded with, so a run stored
  before an update is sent with its own versions and refused instead of being re-labelled.
  Runs stored before versions existed count as version 1 and revision 1.
- The verifier only runs the current simulation. A different `simVersion` or
  `levelRevision` is answered with 409, the backend turns that into a 409 for the client
  ("please reload the page"). A retired version is therefore the same as an unknown one.
- `best_runs` stores `sim_version` and `level_revision` of the run that is the best one,
  existing rows are `1` and `1`.

## Changing physics or a level

1. Write the failing test first: the changed behaviour, or the level with its new layout.
2. Change the code or level, and raise `SIM_VERSION` or the level's `revision` by one.
3. For a level, run `task levels:solve -- <level-id>` so the par time and the reference
   solution match the new layout, then `task test`.
4. Decide what happens to existing best runs of the changed scope and write it in the PR:
   - They stay. They were verified under the old rules and remain valid records, but they
     are not comparable with new runs. Filter on the `sim_version` and `level_revision`
     columns when that matters.
   - They go. Delete the rows of the level (`DELETE FROM best_runs WHERE level_id = ...`),
     or all of them for a `SIM_VERSION` bump, in a migration or by hand.
5. Deploy backend, verifier and frontend together. Until a player reloads, their old client
   gets the 409 above. The backend itself does not know the current versions, so the
   verifier is the single place that decides what is accepted.

## What it does not do

The verifier does not keep old simulations around, so an old replay cannot be re-verified
after a bump. Keeping a replay viewer for retired versions would need the old sim code
under its version number; that is not built.
