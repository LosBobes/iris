# Iris on-premises deployment (Windows Server, Docker Desktop)

> **Which guide?** This one runs Docker Desktop directly on Windows Server
> 2022 or newer. On Windows Server 2019 or older (no WSL2), or whenever you
> prefer Docker to run as a proper service with no signed-in user, follow
> **[VM.md](VM.md)**: an Ubuntu VM in Hyper-V with the same compose file.

This runs Iris on a client's own Windows Server as Linux containers under
**Docker Desktop** (WSL2 backend). The app is reachable only on the client's
LAN, at `http://<server>/`. Updates are automatic: you merge to `main`, CI
publishes new images to GHCR, and a Windows Scheduled Task on the server pulls
and recreates the containers every night. A second task takes a nightly
database backup.

The stack (`docker-compose.yml`) has three services:

- `frontend`: nginx serving the React SPA on port `80` (the only published
  port) and proxying `/api/` to the backend.
- `backend`: the Go API, internal only.
- `db`: PostgreSQL 16, internal only, data in the `iris_postgres_data` named
  volume. Opt-in through `COMPOSE_PROFILES=postgres` in `.env`; without it the
  backend falls back to SQLite in the `iris_sqlite_data` volume (see
  [SQLite installs](#sqlite-installs)).

Images (public GHCR packages, so pulling needs no login):

- `ghcr.io/losbobes/iris-backend:latest`
- `ghcr.io/losbobes/iris-frontend:latest`
- `postgres:16.15` (Docker Hub)

Files in this folder that go to the server:

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | The stack |
| `onprem.env.example` | Template for the server's `.env` |
| `update.ps1` | Pull new images and recreate containers (nightly task) |
| `backup.ps1` | `pg_dump` into `backups\`, keep 14, copy off the machine (nightly task) |
| `restore.ps1` | Load a dump into the database (the Hetzner cutover, or a backup) |
| `register-task.ps1` | Registers the two scheduled tasks |

The scripts work from the folder they are in, so any deploy directory works.
This guide uses `C:\apps\iris`.

## One-time server setup

### 1. Docker Desktop

Requirements: **Windows Server 2022 or newer** (WSL2 is not available on 2019)
with hardware virtualization enabled. Docker Desktop is officially aimed at
Windows 10/11; on Server 2022/2025 it runs on WSL2 the same way. Its license is
free for businesses under 250 employees and $10M revenue.

1. Install WSL2 (`wsl --install`, elevated, then reboot) and Docker Desktop.
2. In Docker Desktop settings:
   - General: **Use the WSL 2 based engine** on, and **Start Docker Desktop
     when you sign in to your computer** on.
   - Confirm it runs **Linux** containers:
     ```powershell
     docker version --format '{{.Server.Os}}'
     ```
     This must print `linux`.
3. **Make the server sign in by itself after a reboot.** Docker Desktop runs
   only while a user is signed in, so after Windows Update restarts the server
   Iris stays down until someone signs in. Use one dedicated local account
   for Docker Desktop and turn on automatic sign-in for it (Sysinternals
   [Autologon](https://learn.microsoft.com/sysinternals/downloads/autologon)
   stores the password encrypted). Locking the screen afterwards is fine; the
   containers keep running in a locked session.
4. Optional: cap WSL's memory so it cannot starve the server. Create
   `%UserProfile%\.wslconfig` for that account:
   ```ini
   [wsl2]
   memory=4GB
   ```
   then `wsl --shutdown` and restart Docker Desktop.

All further steps run as that account.

### 2. Port 80 and the firewall

Windows Server often has IIS bound to port 80. Check, and stop it if it is not
used for anything else:

```powershell
Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue
```

```powershell
Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled
```

Allow port 80 from the LAN:

```powershell
New-NetFirewallRule -DisplayName "Iris HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain,Private
```

Outbound, the server needs HTTPS to `ghcr.io` and Docker Hub (image pulls) and
to Sentry (error reports). Nothing is reachable from the internet.

### 3. Copy the files and configure `.env`

Copy the files from the table above into `C:\apps\iris`. Then create `.env`
from the template with a generated database password (hex, so it needs no
escaping in the connection string):

```powershell
cd C:\apps\iris
$pw = -join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
(Get-Content onprem.env.example) -replace '<hex-password>', $pw | Set-Content -Encoding ascii .env
```

Use `Set-Content -Encoding ascii`, not `>`: Windows PowerShell's `>` writes
UTF-16, which Docker Compose cannot read.

`.env` now holds:

- `COMPOSE_PROFILES=postgres`, `POSTGRES_PASSWORD`, `DATABASE_URL`: the
  backend uses the `db` container. PostgreSQL keeps the **first** password its
  volume was initialised with; changing `POSTGRES_PASSWORD` later does not
  change the database's.
- `IRIS_SECURE_COOKIES=false`: the LAN uses plain `http://`, and browsers
  refuse to store a `Secure` cookie over http (except on `localhost`), so
  without this every sign-in "succeeds" and immediately bounces back to the
  login screen. All other production protections stay on. Remove the line if
  you ever serve the stack over HTTPS.

Keep `.env` on the server only; it is never committed.

### 4. Pull the images and start the database

```powershell
docker compose pull
docker compose up -d db
docker compose ps db        # wait until STATUS says (healthy)
```

Then either [move the Hetzner database](#moving-grafika-čobanović-from-hetzner)
(the normal case) or, for a brand-new organization, start the stack with
`docker compose up -d` and create the organization in the Backoffice
("Organizacije") or with
`docker compose exec backend irisctl create-tenant …`.

### 5. Scheduled tasks

Set `$MirrorDir` at the top of `backup.ps1` to an off-machine folder (a NAS
share such as `\\nas\iris-backups`). Then, **signed in as the Docker Desktop
account**, run once from an elevated PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\iris\register-task.ps1
```

This registers:

- `IrisBackup`, daily 02:15: `backup.ps1`.
- `IrisAutoUpdate`, daily 03:00: `update.ps1`.

Both run as the signed-in account, not SYSTEM: Docker Desktop's engine and
CLI context belong to that user, and a SYSTEM task cannot reliably reach them.
With automatic sign-in the account is always signed in. Re-running the script
replaces the tasks.

Run each once by hand to check them:

```powershell
Start-ScheduledTask -TaskName IrisBackup
Start-ScheduledTask -TaskName IrisAutoUpdate
```

and read `backup.log` / `update.log` in `C:\apps\iris`.

## Moving Grafika Čobanović from Hetzner

The Hetzner box runs Iris on PostgreSQL 16 (`docker-compose.prod.yml`,
`deploy/POSTGRES.md`). The move is a `pg_dump` there and a `pg_restore` here:
same engine, same major version, an exact copy. Nothing is converted.

The dump contains **everything** in that database: every organization (also
`demo`, if seeded there), all users and passwords, the superadmins with their
two-factor enrolment, the Backoffice history. Remove what should not live
on-premises afterwards (step 6).

### Before the window

- Finish steps 1 to 4 above on the Windows server (database running, empty).
- **Freeze merges and disable the "Deploy to Hetzner" workflow** in GitHub
  Actions. It stays disabled after the move: a later merge would otherwise
  start the old stack again and people could keep working there.
- With merges frozen, `:latest` on GHCR is at least the version Hetzner runs
  (every merge publishes `:latest` and deploys Hetzner). Migrations only go
  forward, so the on-prem backend must never be older than Hetzner's. Pull
  once more (`docker compose pull`) to be sure.
- Tell the shop when the system will be unavailable (a few minutes).

### 1. Stop Hetzner and dump (the outage starts here)

On the Hetzner box, in the deploy directory (`/opt/iris`), first do step 0 of
`deploy/POSTGRES.md` (export the running image tag), then:

```bash
C="docker compose -f docker-compose.prod.yml"
$C stop frontend backend
$C exec -T db pg_dump -U iris -d iris --format=custom > iris-cutover.dump
ls -l iris-cutover.dump
sha256sum iris-cutover.dump
```

Stopping the backend first means nothing can write after the dump. (On Linux
`>` is binary-safe; on Windows it is not, which is why the PowerShell scripts
dump inside the container.)

### 2. Copy the dump to the Windows server

For example `scp` it to your laptop, then onto the server as
`C:\apps\iris\iris-cutover.dump`. Compare the checksum:

```powershell
Get-FileHash -Algorithm SHA256 C:\apps\iris\iris-cutover.dump
```

Keep a copy of the dump somewhere safe; it is the exact state at the move.

### 3. Restore

```powershell
cd C:\apps\iris
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore.ps1 -DumpFile .\iris-cutover.dump
```

It asks you to type `RESTORE`, takes a safety dump of the current (empty)
database, restores with `pg_restore --clean --if-exists --no-owner`, and
starts the whole stack. It is safe to re-run.

### 4. Verify

```powershell
docker compose ps                                       # backend (healthy), frontend Up
docker compose logs backend | Select-String storage     # using postgres storage
```

Compare row counts with the same query on Hetzner (`$C exec -T db psql …`
there):

```powershell
docker compose exec -T db psql -U iris -d iris -c "select (select count(*) from tenants) tenants, (select count(*) from users) users, (select count(*) from customers) customers, (select count(*) from work_orders) work_orders, (select count(*) from catalog_items) catalog_items"
```

Then in a browser on a shop PC, at `http://<server>/`:

- enter the organization `grafika-cobanovic`, sign in; the work-order list
  shows the same total as before;
- open an existing order, search a customer with the wrong case and without
  diacritics, print a PDF;
- create a test order: it gets the next order number;
- open `/backoffice` (tap the "Iris" wordmark 5×) and sign in with your
  superadmin and authenticator app; the dashboard loads.

Every device has to enter the organization slug once (devices remember it per
address, and the address changed). Everyone signs in again.

### 5. Hand-over

- Give the shop the new address. A DNS name (e.g. `iris.local`, a record on
  their router or domain controller) is friendlier than an IP; reserve the
  server's IP in DHCP either way.
- Run the backup task once and check that a copy reached `$MirrorDir`.

### 6. Afterwards

- Organizations that should not be on-premises (`demo`): Backoffice →
  Organizacije → suspend, then delete.
- Leave Hetzner **stopped** (database container and volume intact) for 2 to 4
  weeks as the rollback, with the deploy workflow still disabled.
- Rollback, if needed: on Hetzner `$C up -d`. Anything entered on-premises
  since the move is not there; roll back promptly or not at all.

**Public pages:** on a LAN-only server, the public tracking page and the
public organization/announcement endpoints are not reachable from the
internet. Customer tracking links only work inside the shop's network.

## Backups and restore

`backup.ps1` (task `IrisBackup`) writes `backups\iris-YYYYMMDD-HHMMSS.dump`
(`pg_dump --format=custom`), keeps the newest 14, and copies each new one to
`$MirrorDir`. The Backoffice "Sistem" tab reports backups as managed outside
the app on PostgreSQL; `IRIS_BACKUP_*` are ignored. A backup that only exists
on the server's own disk is not a backup: keep `$MirrorDir` set.

Restore one (it replaces all data, after taking a `pre-restore-*.dump` of the
current state):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\iris\restore.ps1 -DumpFile C:\apps\iris\backups\iris-20261103-021500.dump
```

Test a restore now and then, for example into a spare machine with the same
setup.

## Updates

`update.ps1` (task `IrisAutoUpdate`) runs `docker compose pull`,
`docker compose up -d` and `docker image prune -f`, and logs each run to
`update.log`, failures included. Run it by hand, or
`Start-ScheduledTask -TaskName IrisAutoUpdate`, for an immediate update. The
`postgres:16.15` image is pinned, so updates never recreate the database on a
new version. **Do not move to Postgres 18**: its image keeps data under a
different path than the mounted volume. A major upgrade is a dump and restore.

## Rollback of an app version

Every build publishes immutable tags alongside `:latest` (`:git-<sha7>`, and
`:<version>` for releases). To pin a known-good build, edit
`docker-compose.yml`:

```yaml
image: ghcr.io/losbobes/iris-backend:git-1a2b3c4
image: ghcr.io/losbobes/iris-frontend:git-1a2b3c4
```

and run `docker compose up -d`. Change them back to `:latest` to resume
automatic updates. A build older than the database's schema cannot open it
(migrations only go forward); restore the backup taken before the update in
that case.

## Error reporting (Sentry)

Both images report to Sentry (one project per surface) with DSNs baked in at
build time from the `SENTRY_DSN` / `SENTRY_DSN_FRONTEND` GitHub secrets, so it
works with no server config. To point the backend elsewhere or disable it,
uncomment `SENTRY_DSN` in `docker-compose.yml` and set it in `.env` (empty
disables). `IRIS_RELEASE` tags events with a version. The frontend DSN is in
the static bundle and changes only with a rebuild.

Handled failures are reported too (4xx as warnings, 5xx as errors). Each
failed response carries a short reference (`requestId` / `X-Request-Id`)
that the apps show next to the error (`… (kod: AbC123-000042)`); the same code
is in the API log line and on the Sentry event as `request.reference`.

## Client addresses

Browsers connect straight to nginx on port 80, so nginx trusts no
`X-Forwarded-For` (`IRIS_TRUSTED_PROXY` is empty): a LAN client cannot choose
the address the sign-in rate limits count. Behind Docker Desktop's port proxy
the backend may see every LAN client as the same address; the limits then
apply to the office as a whole (5 failed attempts per account and 20 in total
per 15 minutes), which is acceptable on a small trusted LAN. If you put a
reverse proxy in front, set `IRIS_TRUSTED_PROXY` in `.env` to that proxy's
address as nginx sees it, never a range LAN clients can also connect from.

## SQLite installs

Leave `COMPOSE_PROFILES`, `POSTGRES_PASSWORD` and `DATABASE_URL` out of `.env`
and the backend uses SQLite at `/data/iris.db` in the `iris_sqlite_data`
volume; register the tasks with `register-task.ps1 -NoBackup`. Backups then
come from the Backoffice "Sistem" tab: "Napravi kopiju sada" writes a
`VACUUM INTO` copy to `/data/backups` (`IRIS_BACKUP_DIR`), keeps
`IRIS_BACKUP_KEEP` (14), and `IRIS_BACKUP_INTERVAL` (e.g. `24h`) in `.env`
takes them automatically. They sit on the same volume as the database: copy
them off the machine (`docker compose cp backend:/data/backups .\backups`).

To start from an existing SQLite file produced by the same app version,
put it into the volume as `/data/iris.db` **before the backend first starts**
(the backend runs as uid `65532`):

```powershell
cd C:\apps\iris
docker compose down
docker run --rm -v iris_iris_sqlite_data:/data -v ${PWD}:/seed alpine `
  sh -c "cp /seed/seed.db /data/iris.db && chown 65532:65532 /data/iris.db"
docker compose up -d
```

The volume is named `<folder>_iris_sqlite_data` (`docker volume ls`). Never
copy a raw `iris.db` out of a running install: in WAL mode the newest writes
live in `iris.db-wal`; take an `irisctl backup` copy instead.

## Logs

- Scheduled runs: `update.log`, `backup.log`, `restore.log` in the deploy
  directory (timestamped, failures included); Task Scheduler history for
  `IrisAutoUpdate` / `IrisBackup`.
- Containers: `docker compose logs` (`-f` to follow, or a service name such as
  `docker compose logs backend`).
