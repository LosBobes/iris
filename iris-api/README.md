# Iris API

Go HTTP API for Iris operations. It owns authentication, work-order data,
customer/location records, public tracking, and the persistence boundary shared
by the desktop and web clients.

## Runtime Model

- Router: `chi`, declared in `internal/api/server.go`.
- Contract: `openapi.yaml`.
- Persistence: SQLite at `DATABASE_PATH`; local development defaults to
  `./data/iris.db`.
- Test persistence: fixture-backed store under `testdata/fixtures`.
- Sessions: HTTP-only `iris_session` cookie created by `POST /auth/login`.
- Operations CLI: `cmd/irisctl` for migrations, demo seeding, CSV import,
  user creation, and database backup.

## API Surface

Public endpoints:

- `GET /healthz`
- `POST /auth/login`
- `GET /public/work-orders/{token}`

Session endpoints:

- `GET /auth/session`
- `POST /auth/logout`

Authenticated endpoints:

- `GET /customers`
- `POST /customers`
- `PUT /customers/{id}`
- `DELETE /customers/{id}` admin only
- `GET /locations`
- `POST /locations`
- `PUT /locations/{id}`
- `DELETE /locations/{id}` admin only
- `GET /work-orders`
- `GET /work-orders/operators`
- `GET /work-orders/{id}`
- `GET /work-orders/{id}/report`
- `POST /work-orders`
- `PATCH /work-orders/{id}`
- `DELETE /work-orders/{id}` admin only

## Directory Map

```text
iris-api/
├── cmd/
│   ├── irisctl/          # migrations, seed/import, users, backups
│   └── server/           # HTTP server entry point
├── internal/
│   ├── api/              # routes, auth middleware, handlers, reports
│   ├── domain/           # request/response/domain types
│   ├── store/            # Store interface, fixtures, SQLite
│   └── testutil/         # test fixture helpers
├── testdata/fixtures/    # fixture data for tests and local fallback
├── go.mod
└── openapi.yaml
```

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `IRIS_API_ADDR` | HTTP listen address | `:8080` |
| `DATABASE_PATH` | SQLite database path. Docker uses `/data/iris.db`. | `./data/iris.db` outside production |
| `IRIS_DB_PATH` | Legacy SQLite database path fallback when `DATABASE_PATH` is empty. | empty |
| `IRIS_ENV` | Runtime environment. `production` requires explicit database path and session secret. | `development` |
| `IRIS_SESSION_SECRET` | Required production secret for session-capable runtime. | empty |
| `IRIS_ALLOWED_ORIGINS` | Comma-separated CORS origins. Empty allows local dev origins. | empty |
| `IRIS_WEB_DIR` | Static web build directory for SPA fallback. | empty |

## Commands

Run commands from `iris-api/`.

```bash
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
DATABASE_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
```

Operational commands:

```bash
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl create-user -username milica -password '<secret>' -role admin
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-csv --dry-run --dir ./imports
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-csv --apply --dir ./imports
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl backup -out ./backups/iris.db
```

Verification:

```bash
go test ./...
```

## Docker Usage

Run from the repository root:

```bash
docker compose up -d --build
docker compose logs -f iris-api
docker compose down
```

The Docker service sets `DATABASE_PATH=/data/iris.db` and mounts the named
volume `iris_sqlite_data:/data`. The SQLite database is persisted through that
named volume, so recreating the `iris-api` container does not delete the DB.
Removing the volume deletes the DB.

Compose reads server-local variables from a root `.env` file automatically. Do
not commit that file; keep production values such as `IRIS_SESSION_SECRET` only
on the server.

The Docker image also builds `apps/web/dist` and serves it from the API process
with `IRIS_WEB_DIR=/app/web`, so `http://localhost:8080/` is the same-origin web
app and `http://localhost:8080/healthz` is the API health check. If host port
`8080` is already in use, set `IRIS_API_PORT`:

```bash
IRIS_API_PORT=18080 docker compose up -d --build
```

Do not use `docker compose down -v` unless you intentionally want to delete the
SQLite volume and all persisted Iris data. Plain `docker compose down` stops and
removes the container while keeping `iris_sqlite_data`.

The `/data` directory is an internal backend-only mount. Do not expose it through
the API, static web serving, or public Docker mounts. The Docker image contains
the Go binaries and seed fixtures only; it does not copy local or production
`.db` files into the image.

For local Docker demo data, run:

```bash
docker compose run --rm --entrypoint irisctl iris-api seed-demo
```

For a non-demo user, run:

```bash
docker compose run --rm --entrypoint irisctl iris-api create-user -username milica -password '<secret>' -role admin
```

SQLite migrations run idempotently on startup before the API begins serving.
They create missing tables and indexes without destructive rebuilds.

## Local Smoke Checks

```bash
curl -i http://localhost:8080/healthz

curl -i -c /tmp/iris.cookies \
  -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

curl -b /tmp/iris.cookies http://localhost:8080/work-orders
curl -b /tmp/iris.cookies http://localhost:8080/work-orders/operators
```

## Contract Notes

- Update `openapi.yaml`, Go domain types, TypeScript domain types, fixtures, and
  tests together when changing request or response shapes.
- Keep public tracking responses free of internal notes, internal events, and
  private billing details.
- Use fixture store tests and SQLite tests to keep both persistence backends on
  the same API contract.
