# Contributing

Thanks for helping. The short version: open an issue, work on a branch named after it,
write the test first, open a PR that closes the issue. The full loop is in
[docs/WORKFLOW.md](docs/WORKFLOW.md).

## Setup

```bash
task install     # npm ci and uv sync
task check       # lint, format check, type check, all tests
```

Requirements: Node 22.12+, uv, go-task. Podman is only needed for the full stack.

## Repository layout

| Path                             | Contents                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| `packages/sim`                   | Deterministic game simulation, levels, replay format        |
| `frontend`                       | Phaser game, input, touch controls                          |
| `verifier`                       | Node service that replays submitted runs                    |
| `backend`                        | Litestar API with accounts, runs and leaderboard            |
| `e2e`                            | Playwright tests that play the built game in a browser      |
| `docs`                           | Architecture, anti-cheat, versioning, moderation, ops, ADRs |
| `scripts`                        | Smoke test, board helper, backup, health and release tools  |
| `deploy`                         | systemd units for the host (backup timer)                   |
| `*/Containerfile`, `compose.yml` | Image definitions per service and the Podman compose stack  |
| `compose.prod.yml`               | The same stack from published images                        |

## Running the backend tests on PostgreSQL

The default run uses SQLite in memory. CI also runs the suite against PostgreSQL; locally:

```bash
podman run -d --rm --name ti-pg -e POSTGRES_USER=trust -e POSTGRES_PASSWORD=testpw \
  -e POSTGRES_DB=trusttest -p 127.0.0.1:55432:5432 docker.io/library/postgres:17-alpine
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://trust:testpw@127.0.0.1:55432/trusttest uv run pytest
```

## Changing the database schema

Models live in `backend/src/trust_issues_backend/models.py`, the schema in Alembic migrations.
After changing a model, bring a scratch database to the current head and let Alembic propose
the revision (the backend settings are only checked, any random 32+ character values do):

```bash
export DATABASE_URL=sqlite+aiosqlite:///dev.db JWT_SECRET=$(openssl rand -hex 32) \
  VERIFIER_URL=http://127.0.0.1:8081 VERIFIER_TOKEN=$(openssl rand -hex 32)
task backend:migrate
task backend:migration -- "add foo"
```

Read the generated file in `backend/alembic/versions/`, fix what autogenerate cannot know and
commit it with the model change. A test compares the migrated schema with the models.

## Visual regression

`e2e/tests/visual.spec.ts` takes screenshots of every menu and of the start of four levels and
compares them with the committed baselines in `e2e/tests/visual.spec.ts-snapshots/`. Text
rendering differs between machines, so the baselines are only valid for the pinned
Playwright container (`mcr.microsoft.com/playwright:v1.64.1-noble`) that the `Visual
regression` CI job runs in; do not run the comparison on your own machine. After a change of
the look that you intended, regenerate them where they are made:

```bash
scripts/update-visual-baselines.sh   # pushes a temporary branch, renders in CI, downloads the images
git diff --stat e2e/tests/visual.spec.ts-snapshots   # then look at the images and commit them
```

When Playwright is updated, change the image tag in `.github/workflows/ci.yml` and
`visual-baselines.yml` to the same version (the job fails with a clear message if they differ)
and regenerate the baselines in the same pull request.

## Standards

- **Test first.** Add or change the test that expresses the behaviour before the
  implementation. Do not weaken a test to make it pass; if the behaviour really changed,
  say so in the PR.
- **Small, focused changes.** One issue, one PR.
- **No premature abstraction.** Three similar lines beat a helper built for hypothetical
  callers.
- **Validate at boundaries, trust internals.** Input from clients, and responses from
  other services, are validated where they enter. Code behind that boundary is not
  defensive.
- **No dead code.** Delete unused code instead of keeping it "just in case".
- **Comments are documentation.** Docstrings and doc comments on modules, classes and
  functions are welcome; narrative comments inside function bodies are not. If something
  needs explaining, put it in the docstring or the docs.
- **The simulation stays deterministic.** See [docs/ANTI_CHEAT.md](docs/ANTI_CHEAT.md).
- **Never log or return secrets** (tokens, password hashes), including in error paths.

## Commit messages

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, with an
optional scope (`feat(backend): ...`) and the issue number in the subject or body.

## Reporting security issues

Do not open a public issue, see [SECURITY.md](SECURITY.md).
