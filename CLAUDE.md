# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project

Trust Issues is a 2D trap platformer for the browser in the spirit of Level Devil. Players
create accounts, keep progress across devices, and compete on leaderboards whose times are
verified by replaying the submitted inputs on the server. The game runs with keyboard and
optional touch controls. The stack is Phaser 3 + Vite + TypeScript in `frontend/`, a pure
deterministic simulation in `packages/sim`, a Node replay verifier in `verifier/` and a
Python/Litestar backend in `backend/`, deployed with Podman compose on a home lab LXC.

Read before changing related code: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/ANTI_CHEAT.md](docs/ANTI_CHEAT.md), [docs/LEVELS.md](docs/LEVELS.md),
[docs/DESIGN.md](docs/DESIGN.md), [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Commands

Always use `task <name>` (see `Taskfile.yml`, needs go-task), not raw `npm`, `uv` or
`podman compose` calls, when a matching task exists. `task` lists everything.

```bash
task install       # npm ci + uv sync
task dev           # Vite dev server on :3000, proxies /api to :8000
task backend:dev   # Litestar dev server
task verifier:dev  # verifier with reload
task test          # simulation, verifier, frontend (vitest) + backend (pytest)
task check         # lint + format check + typecheck + tests, what CI runs
task format        # prettier + ruff format
task smoke         # real verifier + backend (SQLite), submits a winning replay
task up / down     # whole stack via podman compose
```

Single suites: `npm test --workspace @trust-issues/sim`, `cd backend && uv run pytest tests/test_runs.py`.

## Architecture rules

- **`packages/sim` is deterministic and framework-free.** No `Math.random`, `Date`,
  timers, DOM or Phaser imports (ESLint enforces it). Anything that changes physics or a
  level changes what old replays mean, so it needs an explicit decision and, once
  versioning exists, a version bump.
- **The client never reports a time.** It submits inputs; the verifier derives
  `finished`, `frames`, `deaths`. Never add a backend field that trusts a client number.
- **Levels are server-owned.** Submissions carry only a level id.
- **Every level needs a reference solution** in `packages/sim/src/testing.ts`.
- **One input path.** Keyboard and touch both feed `InputState`; the scene only reads
  `InputState.mask()`.
- **Colours come from `frontend/src/theme.ts`.** No hard-coded colours in components.
- **Backend boundaries are msgspec structs** in `schemas.py` with their constraints
  declared there. Routes trust validated data. Passwords are hashed with argon2 in a
  worker thread; login answers identically for unknown users and wrong passwords.
- **Services talk over the compose network only.** The verifier is never published.

## Code comments

Do not write comments that are not real code documentation. No narrative comments, no
"why I did this" asides, no play-by-play inside function bodies, in any language or file.

Allowed: a doc comment (TSDoc `/** */`, Python docstring) on a module, class, function or
exported constant, and comments continuing a convention already present in that exact
file. Not allowed in config files (YAML, JSON, TOML): state intent in the docs instead.
When in doubt, leave the comment out.

## Testing

Work test-driven: write the test that expresses the desired behaviour before or alongside
the implementation, then make the code satisfy it. Once a test correctly expresses the
behaviour it is fixed: if it fails, assume the code is wrong. Change a test only when the
desired behaviour itself changed, and say so explicitly. Never edit a test to get a suite
green.

Backend tests use SQLite in memory with a fake verifier (see `backend/tests/conftest.py`),
the verifier tests start a real HTTP server on an ephemeral port.

## Engineering standards

- No premature abstraction; a fix does not need a surrounding refactor.
- Validate at boundaries (client input, other services' responses), trust internals.
- No dead code: delete unused code instead of leaving it or prefixing with `_`.
- Security by default: parameterised queries via SQLAlchemy only, never log or return
  secrets, bound the size of anything untrusted, fail closed.
- Small, focused changes: one issue, one branch, one PR.

## Workflow

Full description: [docs/WORKFLOW.md](docs/WORKFLOW.md). The loop in short:

1. **Everything starts as a GitHub issue**, on the Kanban project
   ([Kanban Trust Issues](https://github.com/users/theoleuthardt/projects/2), number `2`,
   owner `theoleuthardt`). Features are sub-issues of an `epic` issue.
2. **Branch** `<issue-number>-<short-description>` from an up-to-date `main`.
3. **Status moves with the work**, using `scripts/kanban-status.sh <issue> <status>`:
   branch created → `progress`, PR opened → `review`, PR merged → `done`.
4. **Test first**, implement, `task check`.
5. **`review main` before opening the PR.** It runs CodeRabbit and falls back to an
   Ollama GLM model. The fallback only sees the diff: verify every finding against the
   code before changing anything, and fix `critical` and `major` ones.
6. **One PR per issue** against `main`, title in Conventional Commits form, body
   `Closes #<n>`. Merge only with green CI and no open findings.
7. For UI changes run the game (`task dev`) and click through the feature, including
   touch mode (`?touch=1`); passing type checks is not the same as a working feature.
8. **Keep this file and the docs current.** If you learn something about structure or
   conventions that is not written down, add it in the same PR.

Board constants (also encoded in `scripts/kanban-status.sh`):

| Item                                     | Value                                             |
| ---------------------------------------- | ------------------------------------------------- |
| Project id                               | `PVT_kwHOA5wDoM4BnFjU`                            |
| Status field id                          | `PVTSSF_lAHOA5wDoM4BnFjUzhlrxsI`                  |
| Backlog / In Progress / In Review / Done | `20952e25` / `79730027` / `6182c40c` / `7c0f2665` |

## Git

- Conventional Commits with the issue number: `feat(frontend): level select (#42)`.
- Never push to `main` directly; every change lands through a PR.
- Do not add model names to commit messages, PR titles or bodies.
