# Deployment

Target: a home lab host running Podman inside an LXC container. The stack is four
containers defined in `compose.yml`: `db`, `verifier`, `backend`, `frontend`.

> The compose file and the images are exercised in CI (image build) and by the smoke test,
> but have not been run on a real LXC host yet. Treat the host notes below as a checklist
> and correct them as you learn.

## Host prerequisites

- An LXC with nesting enabled (`features: nesting=1,keyctl=1` on Proxmox) if Podman runs
  rootless inside an unprivileged container.
- Podman 4.9 or newer and the `podman compose` provider (`podman-compose` or
  `docker-compose` with the Podman socket).
- A reverse proxy or tunnel on the same host in front of the stack. It terminates TLS and
  routes `/api/*` to `127.0.0.1:API_PORT` (the backend) and everything else to
  `127.0.0.1:WEB_PORT` (the static frontend). Both containers speak plain HTTP.

## First start

```bash
git clone https://github.com/theoleuthardt/trust-issues.git
cd trust-issues
cp .env.example .env
```

Fill the secrets with random values, each at least 32 characters:

```bash
openssl rand -hex 32   # run three times: POSTGRES_PASSWORD, JWT_SECRET, VERIFIER_TOKEN
```

Then:

```bash
podman compose up -d --build
curl -fsS http://127.0.0.1:8000/health      # backend and database
curl -fsSI http://127.0.0.1:8080/           # static frontend
```

## Configuration

| Variable            | Used by           | Meaning                                                           |
| ------------------- | ----------------- | ----------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | db, backend       | Database password                                                 |
| `JWT_SECRET`        | backend           | Signs access tokens; 32+ random characters                        |
| `VERIFIER_TOKEN`    | backend, verifier | Shared secret for the internal verify call; 32+ random characters |
| `WEB_PORT`          | frontend          | Loopback host port, default `8080`                                |
| `API_PORT`          | backend           | Loopback host port, default `8000`                                |
| `ENABLE_DOCS`       | backend           | `true` serves the OpenAPI schema at `/schema`                     |

The backend and the verifier exit at startup when a secret is missing, shorter than 32
characters or contains `change-me`/`example`/`placeholder`.

## Updating

The backend needs a verifier that returns the `score` field (added with the score
system). When both change in one release, start the verifier first or restart both together,
otherwise run submissions are answered with 503 until the verifier is updated.

```bash
git pull
podman compose up -d --build
```

The backend container migrates the database to the newest revision before it starts, so an
update needs no manual step. A database created by an earlier version without migrations is
adopted automatically; one that does not match the baseline makes the container exit with a
clear message instead of being modified. Back up before updating (see Backups below).

## Start on boot

Rootless Podman needs lingering and the restart service so `restart: unless-stopped`
survives a host reboot:

```bash
loginctl enable-linger "$USER"
systemctl --user enable --now podman-restart.service
```

## Backups

The only state is the `db-data` volume. A daily dump is enough for this project:

```bash
podman compose exec -T db pg_dump -U trust trustissues | gzip > "trustissues-$(date +%F).sql.gz"
```

Restoring: create an empty database and pipe the dump into `psql`.

## Troubleshooting

| Symptom                    | Likely cause                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| Backend exits right away   | A secret is missing or too weak, see `podman compose logs backend`            |
| Runs are answered with 503 | Verifier unreachable or `VERIFIER_TOKEN` differs between backend and verifier |
| Login or runs return 404   | The proxy does not route `/api/*` to the backend                              |
| Short image names fail     | Images are fully qualified (`docker.io/...`) on purpose, keep it that way     |
