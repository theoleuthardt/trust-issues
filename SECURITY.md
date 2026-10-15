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

## Abuse protection

- **Login:** five wrong passwords lock an account for fifteen minutes (HTTP 429 with
  `Retry-After`); a correct password resets the counter. Every client address may try at most
  twenty logins per minute.
- **Runs:** a player may submit at most thirty runs per minute; refused submissions never reach
  the verifier.
- **Client address:** behind a reverse proxy or tunnel the peer is always the proxy. Set
  `TRUSTED_PROXY_IPS` to its address or network so the limits use the real client address
  (`CF-Connecting-IP`, then `X-Forwarded-For`); headers from any other peer are ignored.
- The limits are kept in the memory of one backend process, which is how this deployment
  runs. Several processes would each count separately.

## Browser protection

- The API answers every request, errors included, with `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy` and a
  `Content-Security-Policy` that allows nothing; only the public leaderboard may be cached
  (15 seconds), everything else is `no-store`. There is no CORS: the game and the API share an
  origin.
- The game page carries a Content-Security-Policy meta tag that only allows its own origin.
  Headers that a meta tag cannot set (framing, HSTS, caching) are listed in
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the proxy.
