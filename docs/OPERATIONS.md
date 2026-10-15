# Operations

## Database backups

`scripts/backup-db.sh` takes a custom-format `pg_dump` of the database through the running
`db` container, checks that the dump is not empty and can be read back, and only then moves it
to its final name `trustissues-<UTC timestamp>.dump`. Dumps older than the retention are deleted.
A failed backup exits non-zero and leaves no file behind.

| Variable                | Default                     | Meaning                                      |
| ----------------------- | --------------------------- | -------------------------------------------- |
| `BACKUP_DIR`            | `./backups`                 | Where dumps are written                      |
| `BACKUP_RETENTION_DAYS` | `14`                        | Dumps older than this many days are deleted  |
| `DB_EXEC`               | `podman compose exec -T db` | Command prefix that runs a command in the db |
| `DB_USER`, `DB_NAME`    | `trust`, `trustissues`      | Database user and name                       |
| `BACKUP_PING_URL`       | unset                       | URL requested after a successful backup      |

### Schedule

`deploy/trust-issues-backup.service` and `.timer` run it daily at about 03:30 on the host
(`systemd`; adjust the paths). Install them with:

```sh
sudo cp deploy/trust-issues-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trust-issues-backup.timer
systemctl list-timers trust-issues-backup.timer
```

Keep `BACKUP_DIR` on another disk than the database volume, ideally copied off the host
(`rsync`, `restic`, a NAS) as well.

### Failure alerting

- `systemctl status trust-issues-backup.service` and `journalctl -u trust-issues-backup` show
  the last run; the unit is marked failed when the script exits non-zero.
- Set `BACKUP_PING_URL` to the check URL of a dead man's switch service (healthchecks.io or a
  self-hosted one). It is requested only after a successful backup, so a missed or failed
  night turns into an alert there. Add an `OnFailure=` unit to the service if you prefer a
  mail or a push.

### Restore test

A backup is only worth something once it was restored.
`scripts/restore-test.sh` restores the newest dump into a scratch database, counts users and
best runs, and drops the scratch database again (also after a failure):

```sh
scripts/restore-test.sh
# restored backups/trustissues-20261015T033000Z.dump into restore_test_4242: 17 users, 52 best runs
```

Do it after setting the schedule up and now and then afterwards. CI runs the same two scripts
against a real PostgreSQL on every change (`Backup and restore` job) and tests their failure
paths with stand-in commands (`scripts/test-backup-scripts.sh`).

### Restoring for real

Restore into a **separate** database first, look at it, and only then switch; the live database
is never dropped before its replacement has been checked. `--exit-on-error` makes a bad dump
stop the procedure instead of restoring half of it.

```sh
podman compose exec -T db createdb -U trust trustissues_restored
podman compose exec -T db pg_restore -U trust -d trustissues_restored --no-owner --exit-on-error < backups/<dump>
podman compose exec -T db psql -U trust -d trustissues_restored -c 'SELECT count(*) FROM users'
```

When the numbers look right, stop the backend and swap the names (the old database stays as
`trustissues_old` until you are sure):

```sh
podman compose stop backend
podman compose exec -T db psql -U trust -d postgres -c 'ALTER DATABASE trustissues RENAME TO trustissues_old'
podman compose exec -T db psql -U trust -d postgres -c 'ALTER DATABASE trustissues_restored RENAME TO trustissues'
podman compose start backend
```

Backups contain password hashes and all runs, so the script creates them readable by the owner
only (directory 700, files 600); keep copies equally private.

## Monitoring

### Is it up

`GET /health` of the backend answers `{"status":"ok"}` after a round trip to the database.
`scripts/check-health.sh` asks it and exits non-zero for anything else, an unreachable service
included:

```sh
HEALTH_URL=https://<your-domain>/health scripts/check-health.sh
```

- Run it from **outside** the host (another machine, or an uptime service that requests the
  same URL) so that the proxy or tunnel is part of what is checked. The proxy has to route
  `/health` to the backend next to `/api`.
- From a cron job or timer, set `HEALTH_PING_URL` to the check URL of a dead man's switch
  (healthchecks.io or self-hosted): the ping is only sent while the service is healthy, so an
  outage, or a monitor that stopped running, turns into an alert there. That is also the alert
  path: the dead man's switch notifies by mail or push, nothing else in this stack sends alerts.
- Inside the stack the backend and the verifier have container health checks
  (`podman compose ps` shows `healthy`), and the database one `pg_isready`.

### Logs

Every service logs to its container log with a size limit (`logging` in `compose.yml`, the log
file of a container is rotated at 10 MB), so a chatty hour cannot fill the disk. Read them with
`podman compose logs -f backend`. The backend and the verifier write one JSON line per request
without bodies, tokens or replays (see DEPLOYMENT.md).

Rejected submissions and moderation actions are also in the database (`audit_events`, kept for
`AUDIT_RETENTION_DAYS`), which is the place to look when a player says a run was refused.
