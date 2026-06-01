# Iris Deployment

Production deployment uses one Go API process, one SQLite database file, and a
static web build. Docker Compose is the preferred server path because it keeps
runtime configuration outside the image and persists SQLite in a named volume.

## Environment Files

Do not commit production `.env` files. Keep secrets on the server and inject
them through Docker Compose, systemd, or the shell that starts the service.

Local examples that are safe to commit:

- `apps/web/.env.example`
- `apps/web/.env.development`

Production files that must stay local to the server:

- `.env`
- `.env.production`
- `apps/web/.env.production`
- any file containing real `IRIS_SESSION_SECRET`, passwords, tokens, or private
  hostnames.

Docker Compose automatically reads a `.env` file next to `docker-compose.yml`
for variable substitution. That file is not copied into the image. Only values
listed under `environment:` in `docker-compose.yml` are passed to the container.

## Backend Production Variables

Required for `IRIS_ENV=production`:

| Variable | Example | Notes |
| --- | --- | --- |
| `IRIS_ENV` | `production` | Enables secure cookies and production startup checks. |
| `DATABASE_PATH` | `/data/iris.db` | Required in production. The Compose service sets this inside the container. |
| `IRIS_SESSION_SECRET` | long random value | Required in production. Generate once and keep stable across restarts. |

Common production variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `IRIS_API_PORT` | `8080` | Host port exposed by Compose. |
| `IRIS_ALLOWED_ORIGINS` | `https://iris.example.com` | Comma-separated browser origins when the web app is served from another origin. |
| `IRIS_WEB_DIR` | `/app/web` | Optional static build directory when serving the SPA from the Go API. |
| `IRIS_API_ADDR` | `:8080` | Container listen address. Keep `:8080` unless the image changes. |

Production startup fails if `DATABASE_PATH` or `IRIS_SESSION_SECRET` is missing.
It also refuses to start when the demo `admin/admin123` user is present.

Generate a session secret on the server:

```bash
openssl rand -base64 32
```

## Docker Compose

Create a server-local `.env` next to `docker-compose.yml`:

```bash
IRIS_ENV=production
IRIS_API_PORT=8080
IRIS_ALLOWED_ORIGINS=https://iris.example.com
IRIS_SESSION_SECRET=replace-with-openssl-rand-output
```

Start or update the backend:

```bash
docker compose up -d --build
docker compose logs -f iris-api
```

Create the first real admin user before exposing the service publicly:

```bash
docker compose run --rm --entrypoint irisctl iris-api create-user -username milica -password '<strong-password>' -role admin
```

If demo data was seeded locally, remove or replace the `admin/admin123` account
before `IRIS_ENV=production`; the backend blocks production startup while that
user exists.

SQLite lives at `/data/iris.db` inside the container and is persisted in the
`iris_sqlite_data` Docker volume. Rebuilding or recreating the container keeps
the database. `docker compose down -v` deletes the volume and the database.

Back up the production database:

```bash
docker compose run --rm --entrypoint irisctl iris-api backup -out /data/backups/iris.db
```

## Web App

The web app reads Vite variables at build time. Runtime changes to
`apps/web/.env.production` do not affect an already-built `dist/` directory.

For a same-origin deployment where the Go API also serves the web build, omit
`VITE_IRIS_API_BASE_URL` or set it to the public origin:

```bash
VITE_IRIS_API_MODE=http
VITE_IRIS_API_BASE_URL=https://iris.example.com
```

For split-origin deployment, point the web build at the API origin and include
the web origin in `IRIS_ALLOWED_ORIGINS`:

```bash
VITE_IRIS_API_MODE=http
VITE_IRIS_API_BASE_URL=https://api.example.com
```

Build locally or on the server:

```bash
cd apps/web
npm ci
npm run build
```

The build output is `apps/web/dist`. Serve it with a reverse proxy/static host,
or copy it into the backend image/runtime path and set `IRIS_WEB_DIR` to that
directory.

## Hetzner VPS Checklist

1. Point DNS for the production hostname to the Hetzner VPS public IP.
2. Install Docker Engine and the Docker Compose plugin on the VPS.
3. Clone the repository into a deploy directory such as `/opt/iris`.
4. Create `/opt/iris/.env` with production values; do not commit this file.
5. Run `docker compose up -d --build` from `/opt/iris`.
6. Create a non-demo admin user with `irisctl create-user`.
7. Put Caddy, Nginx, or another reverse proxy in front of the service for TLS.
8. Configure the proxy to forward HTTPS traffic to `127.0.0.1:8080`.
9. Verify `https://iris.example.com/healthz` and log in with the production user.
10. Schedule regular `irisctl backup` runs and copy backups off the VPS.

Keep port `8080` private to the VPS or firewall it to trusted hosts when a
reverse proxy handles public HTTPS. Public users should enter through the TLS
hostname, not the raw Docker port.
