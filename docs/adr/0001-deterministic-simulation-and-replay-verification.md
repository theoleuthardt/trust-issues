# ADR 0001: Deterministic simulation and replay verification

Status: accepted

## Context

The game has a public leaderboard. A browser game cannot be trusted to report a time: any
value sent by the client can be forged, and the code can be modified.

## Decision

- The game rules live in a pure, deterministic simulation with a fixed tick.
- The client submits the recorded inputs of a run, never a time.
- The server replays the inputs through the same simulation and derives the result.

## Consequences

- Cheating by claiming a time or by changing game rules in the client is not possible.
- The simulation must stay deterministic. This is enforced by lint rules and tests
  (see [ANTI_CHEAT.md](../ANTI_CHEAT.md)).
- Changing physics or levels changes what a replay means. The simulation and levels need
  explicit versions (planned) before any such change is made after launch.
- Replays are small (run-length encoded, typically under a kilobyte) and can be stored for
  moderation and a future replay viewer.
- Bots that send valid inputs are not stopped by this, only made visible.
