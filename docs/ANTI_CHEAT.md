# Anti-cheat

A leaderboard is only worth something if its numbers mean something. This document states
what we defend against, how, and what we explicitly cannot prevent.

## Threat model

| Attacker goal                             | Example                                           |
| ----------------------------------------- | ------------------------------------------------- |
| Post a time that was not achieved         | `curl` a request claiming 0.5 seconds             |
| Post a run that is impossible in the game | Edit the client to walk through walls             |
| Corrupt other players' data               | Overwrite someone else's best run                 |
| Abuse the verification path               | Huge or malformed replays to exhaust the verifier |

## Layers of defence

1. **The client never reports a time or a score.** It only sends the recorded inputs. There
   is no `frames` or `score` field to forge; extra fields in a submission are ignored.
2. **Deterministic simulation.** The same inputs always produce the same run, on any
   machine. The simulation uses a fixed tick, no randomness, no wall-clock time and no
   rendering state.
3. **Server-side replay.** The verifier runs the submitted inputs through the same code and
   derives `finished`, `frames`, `deaths` and the score itself, using the level's par time
   from the server's copy. A modified client cannot walk through
   a wall because the server's simulation has no such behaviour.
4. **Server-owned levels.** The submission carries only a level id. Layout, traps and the
   frame budget come from the server's copy.
5. **Strict input validation.** Replay length is bounded in the backend (list size) and in
   the verifier (body size and the level's `maxFrames`). Masks must be integers within the
   defined bit set, counts positive integers within a cap. Invalid input is rejected, not
   repaired.
6. **Limited.** A player may submit thirty runs per minute and every address twenty login
   attempts; five wrong passwords lock an account for fifteen minutes (see SECURITY.md).
7. **Authenticated and separated.** Submissions need a bearer token. The verifier is not
   exposed and requires its own shared token. Every user has at most one best run per
   level, and a run is only stored for the authenticated user.

## Rules for simulation code

The determinism of `packages/sim` is a security property. Do not break it:

- No `Math.random`, `Date`, `performance.now`, timers or `requestAnimationFrame`. ESLint
  enforces this for `packages/sim/src`.
- No imports of Phaser or anything DOM related.
- Only add, subtract, multiply and divide on numbers. Transcendental functions
  (`Math.sin`, `Math.pow` with fractional exponents, ...) may differ between JavaScript
  engines. If one is ever needed, replace it with a table or integer math.
- Iterate collections in a defined order. Arrays and `Set` insertion order are fine.
- Every level needs a reference solution in `packages/sim/src/testing.ts`. A test replays
  it, so an unwinnable or changed level fails CI.
- Changing physics or a level means bumping `SIM_VERSION` or the level's `revision`; the
  procedure is in [VERSIONING.md](VERSIONING.md). A replay recorded with other versions is
  refused instead of being judged by rules it was not played under.

## Plausibility flags

The verifier marks a finished run that is valid but looks made by a tool
(`packages/sim/src/plausibility.ts`). The run still counts and is stored, with its flags on
the `best_runs` row, and the backend logs one warning line (user id, level, flags, frames;
never the replay) for a flagged best run. Moderators see the flags and decide
([MODERATION.md](MODERATION.md)); nothing is hidden automatically.

| Flag                   | Raised when                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `faster-than-possible` | the run took less than 70% of the par time. Par is the reference solution of the level, found by a search that humans can beat only by a small margin. |
| `repetitive-input`     | a pattern of two to four input entries repeats ten times back to back with identical timing, which human input does not do.                            |

The reference solutions of all levels are tested to stay unflagged, so a threshold change
that would flag them fails CI.

## What this does not prevent

Verification proves that the inputs are **possible in the game**, not that a human produced
them. These remain open:

- **Tool-assisted runs and bots.** A script that sends perfect inputs produces a valid
  replay. The mitigations are social and statistical: store replays and let anyone watch
  them (we do), flag runs with inhuman input patterns (we do), allow removing entries (we do,
  see [MODERATION.md](MODERATION.md)).
- **Account sharing and multiple accounts.**
- **A stolen token** until it expires or is revoked through `token_version`.

## Replays are public

`GET /api/replays/{run_id}` returns the stored replay of a run that is on the leaderboard,
without authentication; a hidden run answers 404. The game's replay viewer plays it back through
the same simulation, so anyone can check that a time looks like a person made it. A replay is
only played with the simulation version and level revision it was recorded with, otherwise the
viewer says so instead of showing something else. Downloads are limited per client address.

## What a profile shows

`GET /api/players/{username}` returns exactly what the leaderboards already show about a
player: the name and the best visible run per level with its score, frames, deaths and
completion time. Hidden runs are left out and nothing else of the account (id, creation
date, flags, versions) is part of the answer; the lookups are rate limited per address like
replay downloads.
