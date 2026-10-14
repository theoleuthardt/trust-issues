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
6. **Authenticated and separated.** Submissions need a bearer token. The verifier is not
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

## What this does not prevent

Verification proves that the inputs are **possible in the game**, not that a human produced
them. These remain open:

- **Tool-assisted runs and bots.** A script that sends perfect inputs produces a valid
  replay. The mitigations are social and statistical: store replays (we do), add a replay
  viewer so anyone can inspect the top runs, flag runs with inhuman input patterns, allow
  removing entries.
- **Account sharing and multiple accounts.**
- **A stolen token** until it expires or is revoked through `token_version`.

## Planned hardening

Tracked on the board as part of the anti-cheat epic:

- Version the simulation and the levels, so changed physics cannot silently invalidate or
  re-validate old replays.
- Rate limits for submissions and for login attempts, account lockout.
- Plausibility checks on replays (minimum frame count per level, input pattern heuristics).
- Replay viewer and moderation tools (flag, hide, delete an entry).
- An audit log of rejected submissions.
