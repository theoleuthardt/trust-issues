# ADR 0002: Node verifier reusing the simulation

Status: accepted

## Context

ADR 0001 requires the server to run the simulation. The backend is Python (Litestar), the
simulation is TypeScript because the client needs it.

## Options

- **A. A small Node service** that imports `packages/sim` and exposes `POST /verify`. The
  backend calls it over the internal network.
- **B. Port the simulation to Python** and run it inside the backend.

## Decision

Option A.

## Consequences

- One implementation of the rules. There is no drift between what the player experienced
  and what the server accepts.
- One more container and one more internal hop per submission. Verification takes a few
  milliseconds, so the hop is irrelevant for load.
- The verifier is stateless, trusts nothing from the caller, and is reachable from the
  backend only. It still requires a shared token as defence in depth.
- Option B stays available if the extra service ever becomes a burden, at the cost of
  maintaining two implementations and a cross-language conformance test suite.
