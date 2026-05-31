# Iris API

Go HTTP API for Iris operations. It owns authentication, work-order data,
customer/location records, public tracking, and the persistence boundary shared
by the desktop and web clients.

## Runtime Model

- Router: `chi`, declared in `internal/api/server.go`.
- Contract: `openapi.yaml`.
- Production persistence: SQLite when `IRIS_DB_PATH` is set.
- Development/test persistence: fixture-backed store under `testdata/fixtures`.
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
| `IRIS_DB_PATH` | SQLite database path. Empty uses fixtures outside production. | empty |
| `IRIS_ENV` | Runtime environment. `production` requires SQLite and session secret. | `development` |
| `IRIS_SESSION_SECRET` | Required production secret for session-capable runtime. | empty |
| `IRIS_ALLOWED_ORIGINS` | Comma-separated CORS origins. Empty allows local dev origins. | empty |
| `IRIS_WEB_DIR` | Static web build directory for SPA fallback. | empty |

## Commands

Run commands from `iris-api/`.

```bash
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl migrate
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
IRIS_DB_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
```

Operational commands:

```bash
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl create-user -username milica -password '<secret>' -role admin
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl import-csv --dry-run --dir ./imports
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl import-csv --apply --dir ./imports
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl backup -out ./backups/iris.db
```

Verification:

```bash
go test ./...
```

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
