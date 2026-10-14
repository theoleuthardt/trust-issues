# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/theoleuthardt/trust-issues/security/advisories/new)
and do not open a public issue. Include what you found, how to reproduce it and what you
think the impact is. You will get an answer as soon as the maintainer can look at it.

## Scope

In scope: the backend API, the verifier, authentication and session handling, and anything
that lets a player publish a leaderboard time they did not legitimately achieve.

Out of scope: denial of service through sheer traffic volume, and findings that need a
compromised host or a compromised player device.

Cheating on the leaderboard is treated as a security topic here. The threat model and the
known limits are in [docs/ANTI_CHEAT.md](docs/ANTI_CHEAT.md).

## Handling secrets

`JWT_SECRET`, `VERIFIER_TOKEN` and `POSTGRES_PASSWORD` are random values generated per
deployment and kept in `.env`, which is git-ignored. The backend and the verifier refuse to
start with short or placeholder values.
