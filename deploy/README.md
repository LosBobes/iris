# Iris deployment (Windows Server, Linux containers)

This deploys the Iris stack to a client's Windows Server as Linux containers
(Docker with the WSL2 backend). The app is reachable only on the client's LAN.
Updates are automatic: you push to `main`, CI builds and publishes new images
to GHCR, and a Windows Scheduled Task on the server pulls and redeploys on a
schedule. There is no Watchtower or in-container updater; the scheduled task is
the whole update mechanism.

The stack is two services (see `docker-compose.yml`):

- `frontend`: nginx serving the React SPA, publishing port `80`, and proxying
  `/api/` to the backend.
- `backend`: the Go API, internal only (not published), with the SQLite
  database stored in the `iris_sqlite_data` named volume.

Images (published to GHCR as **public** packages, so pulling needs no login):

- `ghcr.io/losbobes/iris-backend:latest`
- `ghcr.io/losbobes/iris-frontend:latest`

## One-time server setup

### 1. Install Docker and confirm Linux containers

1. Install Docker Desktop (or Docker Engine) on the Windows Server.
2. Enable the WSL2 backend.
3. Confirm Docker is running **Linux** containers, not Windows containers:
   ```powershell
   docker version --format '{{.Server.Os}}'
   ```
   This must print `linux`.

### 2. Confirm registry access

The GHCR packages are **public**, so the server can pull them anonymously. No
`docker login` and no access token are required. The only requirement is
**outbound HTTPS to `ghcr.io`**. This is independent of the inbound LAN access;
do not add any inbound port publishing beyond the frontend's `80:80`.

You can verify access from the server without starting the stack:

```powershell
docker pull ghcr.io/losbobes/iris-frontend:latest
```

> Note: if the packages are ever switched back to **private**, the server must
> authenticate before it can pull. In that case, log in once with a GitHub
> personal access token (classic) that has the `read:packages` scope. Run
> `docker login ghcr.io -u <github-username>` and paste the token as the
> password, which stores the credentials so the scheduled task can pull
> without prompting. If pulls start failing after that, an expired or revoked
> token is the first thing to check.

### 3. Copy the deploy files to the server

Pick a deploy directory (the scripts default to `C:\apps\iris`; if you change
it, update `$AppDir` in both `update.ps1` and `register-task.ps1`). Copy into
it:

- `docker-compose.yml` (from this `deploy/` folder)
- `update.ps1`
- `register-task.ps1`

Optionally create a `.env` file next to `docker-compose.yml` to set
`IRIS_SESSION_SECRET` (a strong random value) and `IRIS_ENV=production`. Do not
commit that file; it stays only on the server.

Error reporting goes to Sentry. The DSN is baked into the published backend
image at build time, from the `SENTRY_DSN` GitHub Actions secret, so it works
with no server config. To point at a different Sentry project or disable it,
uncomment the `SENTRY_DSN` line in `docker-compose.yml` and set it in the
`.env` file (an empty value disables Sentry, since the backend enables it only
on a non-empty DSN). You can also set `IRIS_RELEASE` (for example the deployed
git sha) so events are tagged with a version.

### 3a. (Optional) Seed the database from an existing SQLite file

If you already have a SQLite database you want to start from, place it into the
`iris_sqlite_data` volume as `/data/iris.db` **before the backend first starts**.
The backend opens (and, if missing, creates) the database at that path, so the
seed must be in place first. The file must be a database produced by this same
app version, since the backend runs migrations against whatever it finds.

1. Copy your seed file into the deploy directory, for example as `seed.db`:
   ```powershell
   cd C:\apps\iris
   copy <path-to-your>\iris.db .\seed.db
   ```
2. If the stack is already running, stop it first (this keeps the volume):
   ```powershell
   docker compose down
   ```
3. Write the seed file into the volume as `/data/iris.db`. The backend runs as
   uid `65532`, so set ownership to match:
   ```powershell
   docker run --rm -v iris_iris_sqlite_data:/data -v ${PWD}:/seed alpine `
     sh -c "cp /seed/seed.db /data/iris.db && chown 65532:65532 /data/iris.db"
   ```
   The volume is named `<project>_iris_sqlite_data`, where `<project>` is the
   deploy folder name (so `iris_iris_sqlite_data` for `C:\apps\iris`). Confirm
   the exact name with `docker volume ls` if unsure.

After this, continue with the start step below. To **replace** the database on
a server that is already live, run the same steps (stop, copy in, then
`docker compose up -d`); the new `iris.db` overwrites the old one.

Pull and start the stack once to verify:

```powershell
cd C:\apps\iris
docker compose pull
docker compose up -d
```

The UI should now be reachable on the LAN at `http://<server-ip>/`, and
`/api/...` calls should reach the backend.

### 4. Install the scheduled task

Run once, elevated (Administrator):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\iris\register-task.ps1
```

This creates the `IrisAutoUpdate` task, which runs `update.ps1` daily at 3am as
SYSTEM.

### 5. Trigger a manual update

Either run the update script directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\iris\update.ps1
```

or start the scheduled task on demand:

```powershell
Start-ScheduledTask -TaskName IrisAutoUpdate
```

Either way, the latest images are pulled and the containers are recreated. The
`iris_sqlite_data` volume is untouched, so no data is lost.

## Rollback

Every build publishes immutable version tags alongside `:latest`
(`:git-<sha7>`, and `:<version>` for semver git tags), so you can pin a
known-good build:

1. Edit `docker-compose.yml` and replace `:latest` with the known-good tag, for
   example:
   ```yaml
   image: ghcr.io/losbobes/iris-backend:git-1a2b3c4
   image: ghcr.io/losbobes/iris-frontend:git-1a2b3c4
   ```
2. Apply it:
   ```powershell
   docker compose up -d
   ```

To return to automatic updates later, change the tags back to `:latest`.

## Logs

- Update runs: `update.log` in the deploy directory (each run is timestamped,
  including failures).
- Container logs: `docker compose logs` (add `-f` to follow, or a service name
  like `docker compose logs backend`).
- Scheduled task history: Task Scheduler, under the `IrisAutoUpdate` task.
