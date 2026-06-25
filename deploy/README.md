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

Images:

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

### 2. Log in to GHCR

The GHCR packages are private, so the server must authenticate before it can
pull. Use a GitHub personal access token (classic) with the `read:packages`
scope:

```powershell
docker login ghcr.io -u <github-username>
# paste the personal access token when prompted for a password
```

This stores the credentials so the scheduled task can pull without prompting.

Note: if pulls start failing later (the scheduled task stops updating), an
expired or revoked token is the first thing to check. Re-run `docker login`
with a fresh token.

The server needs **outbound HTTPS to `ghcr.io`** to pull images. This is
independent of the inbound LAN access; do not add any inbound port publishing
beyond the frontend's `80:80`.

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
