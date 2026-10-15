# Trust Issues

A 2D trap platformer for the browser in the spirit of _Level Devil_: nothing is what it
looks like, the floor lies, the spikes appear where you just stood. Fewer rules, meaner
levels, more of them.

- **Play on desktop or phone.** Keyboard, or on-screen touch controls on touch devices.
- **Accounts and progress.** Sign up, keep your completed levels across devices.
- **Leaderboards you can trust.** Times are not reported by the client. The server replays
  your recorded inputs through the same deterministic simulation and derives the time itself.
- **Watch the best runs.** Every leaderboard entry has a Watch button that plays the stored
  run back in the game, with speed control. A ghost of your own best run can race you.

> Status: playable. Twenty levels with three or four stages each, a deterministic simulation,
> accounts, verified runs and a leaderboard API exist; a title screen, sign-in and registration,
> a main menu and the level select are in the game. Finished runs are sent to the server and
> verified, and each level has a leaderboard screen. An account screen covers password change, signing out everywhere and
> deletion, a pause menu and a settings screen (key rebinding, touch layout, reduced motion) are
> available. The work is tracked on the
> [Kanban board](https://github.com/users/theoleuthardt/projects/2) (private) and in the
> issues of this repository.

## Stack

| Part       | Tech                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| Game       | Phaser 3, Vite, TypeScript                                             |
| Simulation | Pure TypeScript package shared by client and verifier (`packages/sim`) |
| Verifier   | Small Node service replaying submitted runs (`verifier/`)              |
| Backend    | Python 3.13, Litestar, SQLAlchemy 2 (async), PostgreSQL (`backend/`)   |
| Hosting    | Podman compose, intended for a home lab LXC                            |

How the pieces fit together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository

Everything lives in this one monorepo: the game, the shared simulation, the verifier, the
backend, the container definitions (`Containerfile` per service, plus `compose.yml`), the
docs and the CI. Frontend, simulation and verifier are npm workspaces; the backend is a uv
project.

## Quick start

Requirements: Node 22.12+, [uv](https://docs.astral.sh/uv/), [go-task](https://taskfile.dev),
Podman (only for the full stack).

```bash
task install        # npm ci + uv sync
task test           # simulation, verifier, frontend and backend tests
task dev            # Vite dev server on http://localhost:3000
```

The backend needs a verifier and a database. For a quick local run without Postgres:

```bash
task smoke          # starts verifier + backend (SQLite), registers, submits a winning replay
```

Full stack with Postgres:

```bash
cp .env.example .env    # fill in the three secrets, see docs/DEPLOYMENT.md
task up                 # podman compose up -d --build
```

The frontend (static files, `127.0.0.1:8080`) and the API (`127.0.0.1:8000`) are separate
containers. The game calls the API on the same origin under `/api`, so whatever serves the
site has to route `/api/*` to the API and everything else to the frontend; see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). For local development `task dev` does this with
the Vite proxy.

## Controls

| Action       | Keyboard                  | Touch               |
| ------------ | ------------------------- | ------------------- |
| Move         | `←` `→` or `A` `D`        | on-screen arrows    |
| Jump         | `Space`, `↑` or `W`       | on-screen jump      |
| Restart run  | `R`                       | tap after finishing |
| Pause menu   | `Esc`                     | Menu button         |
| Leaderboard  | `L` on the finish screen  | -                   |
| Send again   | `S` (after a failed send) | -                   |
| Next level   | `Enter`                   | tap after finishing |
| Ghost on/off | `G`                       | -                   |
| Replay speed | `1`-`5` (0.25x to 4x)     | -                   |
| Replay pause | `Space`                   | -                   |
| Close replay | `Esc`                     | Close replay button |

`?level=<id>` starts a level directly (handy for testing, it ignores the unlock order).
Touch controls show up on touch devices automatically; force them with `?touch=1` or hide
them with `?touch=0`.

The Settings screen in the menu changes the keys of left, right and jump (a few keys the game
itself uses are not available), the size, side and opacity of the touch buttons, and turns on
reduced motion, which skips particles, pops and pulses. Reduced motion follows the system
preference until you choose. Settings are stored in the browser.

## Documentation

| Document                                     | Contents                                                  |
| -------------------------------------------- | --------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow of a run, data model                |
| [docs/ANTI_CHEAT.md](docs/ANTI_CHEAT.md)     | Threat model, the layers of defence, what is not covered  |
| [docs/SCORING.md](docs/SCORING.md)           | How the score is computed and how the leaderboard ranks   |
| [docs/VERSIONING.md](docs/VERSIONING.md)     | Simulation and level versions, changing physics or levels |
| [docs/MODERATION.md](docs/MODERATION.md)     | Admins, hiding and deleting runs, flagging users          |
| [docs/LEVELS.md](docs/LEVELS.md)             | Level format and how to add a level                       |
| [docs/DESIGN.md](docs/DESIGN.md)             | Visual language and palette                               |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | Running it with Podman on a home lab                      |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)         | Issues, Kanban board, branches, PRs, reviews              |
| [docs/adr/](docs/adr/)                       | Architecture decision records                             |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | How to contribute                                         |
| [SECURITY.md](SECURITY.md)                   | Reporting vulnerabilities                                 |
| [CLAUDE.md](CLAUDE.md)                       | Instructions for Claude Code sessions                     |

## License

[MIT](LICENSE)
