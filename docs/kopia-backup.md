# Money Penny backups with Kopia

Money Penny retains its existing PostgreSQL and statement volumes. A host script
prepares one directory for Kopia; no volume migration or Compose change is needed.
This setup is installed on the Linux Coolify host, not in the web container.

## Backup contents

```text
/srv/money-penny/backup/
├── ledger.dump                 # PostgreSQL custom-format dump
├── files/                      # Complete contents of the app's /data volume
│   └── uploads/                # Original statements
├── configuration/              # Optional .env and Compose files
└── manifest.json               # UTC capture time, project and image IDs
```

The preparation script locates one running web, worker and db container by their
Docker Compose labels. It stops web and worker, leaves PostgreSQL running, dumps
the database, validates the dump's table of contents with pg_restore, and copies
/data from the stopped web container. It restarts the app before publishing the
completed bundle. Ordinary command failures restart the app and preserve the
previous completed backup. The script refuses unrelated destination directories.
A host/process crash or forced kill can still require restarting the app manually.
Do not prepare backups during a Coolify deployment.

## Install and first capture

Requirements: host Python 3, Docker CLI, sufficient disk space for a temporary
backup alongside the previous backup, and a user able to operate Docker. Use the
same privileged host user for preparation and Kopia so it can read the private
backup directory. GitHub contains the script, not your actual backups.

On the Coolify host, find the exact project identity:

```sh
docker ps --filter label=com.docker.compose.service=web \
  --format '{{.Names}}  {{.Label "com.docker.compose.project"}}'
```

Choose the Money Penny entry, not another application's web service. Clone or
update the Money Penny repository on the host, then install the script:

```sh
sudo install -m 700 scripts/prepare_backup.py /usr/local/sbin/money-penny-prepare-backup
sudo /usr/local/sbin/money-penny-prepare-backup \
  --project YOUR_EXACT_COMPOSE_PROJECT \
  --destination /srv/money-penny/backup
```

This causes brief application downtime while copying local data. Its duration
scales with database and statement size; Kopia upload occurs after the app has
restarted. Check the app resumes, and inspect the manifest and backup contents.

To include credentials and deployment configuration, add:

```sh
--config-dir /actual/path/to/the/Coolify/deployment-directory
```

Use the directory containing this deployment's generated `.env` and Compose file.
The script copies only those files, not the source checkout, Docker images, logs,
or arbitrary neighbouring folders. Confirm the expected `.env` was included.
If configuration is kept elsewhere, back it up separately. The staging directory
is private (0700), including when its contents contain credentials.

## Configure Kopia on the host

Connect Kopia to an encrypted repository stored off this server. Use the Kopia
configuration and repository connection belonging to the user that runs the
scheduled snapshots; invoking a different user's Kopia may select a different
repository or policy. Keep the repository password available outside the host.

Create a root-owned wrapper, replacing the project identity and optional config
path with the values verified above:

```sh
#!/bin/sh
set -eu
exec /usr/local/sbin/money-penny-prepare-backup \
  --project YOUR_EXACT_COMPOSE_PROJECT \
  --destination /srv/money-penny/backup \
  --config-dir /actual/path/to/the/Coolify/deployment-directory
```

Install that wrapper as `/usr/local/sbin/money-penny-before-snapshot` with mode
0700. Omit the config-dir argument if configuration is backed up separately.
Then run these commands as the same Kopia user:

```sh
kopia policy set /srv/money-penny/backup \
  --before-snapshot-root-action /usr/local/sbin/money-penny-before-snapshot \
  --action-command-mode essential \
  --action-command-timeout 15m \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 12

kopia snapshot create /srv/money-penny/backup --force-enable-actions
```

Enable actions for the scheduled client too: use `--enable-actions` when connecting
the repository, or set `enableActions` to true in the repository configuration as
documented by Kopia. `--force-enable-actions` above enables only that manual run.
A failed preparation must fail the snapshot, rather than back up an old dump.

In Kopia's running scheduler/UI, schedule this source nightly, for example at
02:00 America/Chicago. A policy alone does not start a scheduler. Make sure that
client runs continuously, uses the intended timezone, and has actions enabled.
An alternative is an existing host scheduler invoking the manual snapshot command
above nightly; use one scheduling method. Set the action timeout above your
observed capture duration. Configure failure notifications in your backup system.

Snapshot only the prepared backup directory. Do not also run an independent
preparation schedule that could replace it while Kopia is reading. The lock
prevents two preparations from running together; the before action is what keeps
capture and snapshot sequencing correct. Verify .env files are not excluded by
inherited Kopia ignore policies.

Official references:
- [Kopia snapshot actions](https://kopia.io/docs/advanced/actions/)
- [Kopia policy options](https://kopia.io/docs/reference/command-line/common/policy-set/)
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)

## If Kopia runs in Docker or on another machine

The script still runs on the Coolify host. A Docker Kopia client needs a read-only
bind mount of `/srv/money-penny/backup` and an orchestration method that prepares
on the host before starting its snapshot. Mounting the folder alone does not run
the preparation script. Avoid mounting Docker's socket into Kopia solely to make
this hook work; use a host wrapper that prepares, then invokes the Kopia container.

For a remote Kopia machine, prepare and transfer a completed bundle before
snapshotting the transferred folder. Do not use the host-only hook instructions
unchanged in either of these arrangements.

## Restore drill

Test using a separate deployment and empty PostgreSQL database, never the live
ledger. Restore one Kopia snapshot to a temporary directory and verify it contains
the dump, file bundle, and manifest from the same capture.

1. Deploy the recorded app version/image with matching configuration. Keep web
   and worker stopped while restoring. Start only PostgreSQL.
2. Run `pg_restore -U ledger -d ledger --no-owner --exit-on-error` inside that
   deployment's PostgreSQL container, streaming ledger.dump to stdin with
   `docker exec -i`. Do not use --clean against a live database.
3. Copy `files/.` to the isolated statement volume's `/data/`, including the
   original `uploads/` layout. Set ownership to UID/GID 10001 using a temporary
   root helper/container; the running app user cannot fix root-owned files.
4. Start web and worker. Verify login, accounts, transaction totals, merchant
   rules, and downloading an original CSV/PDF. Review queued jobs: restored jobs
   may resume and AI jobs may make provider requests.
5. Record the successful restore date and repeat after backup/schema changes.

PostgreSQL's live volume does not need to be included in Kopia alongside a valid
logical dump. Separately back up Coolify's own configuration/recovery credentials
if you want to recover the entire server rather than only Money Penny.
