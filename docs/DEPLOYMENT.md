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
- A reverse proxy or tunnel in front for TLS (Caddy, Nginx Proxy Manager, Cloudflare
  Tunnel). The frontend container speaks plain HTTP on `WEB_PORT`.

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
curl -fsS http://localhost:8080/api/auth/me   # 401 means frontend and backend are wired
```

## Configuration

| Variable            | Used by           | Meaning                                                           |
| ------------------- | ----------------- | ----------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | db, backend       | Database password                                                 |
| `JWT_SECRET`        | backend           | Signs access tokens; 32+ random characters                        |
| `VERIFIER_TOKEN`    | backend, verifier | Shared secret for the internal verify call; 32+ random characters |
| `WEB_PORT`          | frontend          | Host port, default `8080`                                         |
| `ENABLE_DOCS`       | backend           | `true` serves the OpenAPI schema at `/schema`                     |

The backend and the verifier exit at startup when a secret is missing, shorter than 32
characters or contains `change-me`/`example`/`placeholder`.

## Updating

```bash
git pull
podman compose up -d --build
```

The backend creates missing tables at startup. Until migrations exist (planned), schema
changes need a manual step and are called out in the release notes.

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

| Symptom                       | Likely cause                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Backend exits right away      | A secret is missing or too weak, see `podman compose logs backend`            |
| Runs are answered with 503    | Verifier unreachable or `VERIFIER_TOKEN` differs between backend and verifier |
| `frontend` restarts in a loop | nginx cannot resolve `backend` yet; it recovers once the backend is up        |
| Short image names fail        | Images are fully qualified (`docker.io/...`) on purpose, keep it that way     |
