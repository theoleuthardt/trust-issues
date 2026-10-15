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

Stop the backend, then restore into a fresh database and start the backend again; it migrates
on start:

```sh
podman compose stop backend
podman compose exec -T db dropdb -U trust trustissues
podman compose exec -T db createdb -U trust trustissues
podman compose exec -T db pg_restore -U trust -d trustissues --no-owner < backups/<dump>
podman compose start backend
```
