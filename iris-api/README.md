# Iris API

Go HTTP API for Iris operations. It owns authentication, work-order data,
customer/location records, public tracking, and the persistence boundary behind
the web client.

## Runtime Model

- Router: `chi`, declared in `internal/api/server.go`.
- Contract: `openapi.yaml`.
- Persistence: PostgreSQL at `DATABASE_URL` when set, otherwise SQLite at `DATABASE_PATH`; local development defaults to
  `./data/iris.db`.
- Test persistence: fixture-backed store under `testdata/fixtures`.
- Multi-tenancy: every row is scoped to a tenant (organization). `POST /auth/login`
  takes `{ orgSlug, username, password }`, resolves the tenant by slug, and
  authenticates within it. `requireAuth` attaches the tenant to the request context
  (`store.ContextWithTenant`), and every store query filters by `tenant_id`.
- Sessions: HTTP-only `iris_session` cookie created by `POST /auth/login`. The
  token is stored only as a SHA-256 hash. Idle expiry slides on use (rewritten at
  most hourly) under an absolute cap: 12 h idle / 24 h cap with a browser-session
  cookie, or 7 days / 30 days with a persistent cookie when the request has
  `remember: true`. Failed sign-ins are rate limited per 15 min (429): 5 per
  organization + username from one client IP, 20 per IP, 50 per account overall. State-changing requests with a foreign `Origin`
  header are rejected (403).
- Operations CLI: `cmd/irisctl` for migrations, demo seeding, tenant/user creation,
  CSV import, and database backup.

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
- `GET /customers/{id}`
- `POST /customers`
- `PUT /customers/{id}`
- `DELETE /customers/{id}` admin only
- `GET /locations` (optional `?customerId=` filter)
- `POST /locations`
- `PUT /locations/{id}`
- `DELETE /locations/{id}` admin only
- `GET /dashboard` (optional `?dateFrom=&dateTo=&issuedBy=&companyKey=&today=`; `finance` is admin only)
- `GET /work-orders`
- `GET /work-orders/operators`
- `GET /work-orders/{id}`
- `GET /work-orders/{id}/report`
- `POST /work-orders/preview`
- `POST /work-orders/reserve-number` · `POST /work-orders/release-number`
- `POST /work-orders`
- `POST /work-orders/{id}/edit-lock` · `DELETE /work-orders/{id}/edit-lock`
- `PATCH /work-orders/{id}`
- `DELETE /work-orders/{id}` admin only
- `GET /enum-values`
- `POST /enum-values` · `PUT /enum-values/{id}` · `DELETE /enum-values/{id}` admin only
- `GET /catalog-items` · `GET /catalog-items/{id}`
- `GET /catalog-items/{id}/cost-history` admin only
- `POST /catalog-items` · `PUT /catalog-items/{id}` · `DELETE /catalog-items/{id}` admin only
- `GET /settings`
- `PUT /settings` admin only
- `GET /users` · `POST /users` · `PUT /users/{id}` · `DELETE /users/{id}` admin only

## Directory Map

```text
iris-api/
├── cmd/
│   ├── irisctl/          # migrations, seed/import, users, backups
│   └── server/           # HTTP server entry point
├── internal/
│   ├── api/              # routes, auth middleware, handlers, reports
│   ├── domain/           # request/response/domain types
│   ├── store/            # Store interface, fixtures, SQLite + Postgres
│   └── testutil/         # test fixture helpers
├── testdata/fixtures/    # fixture data for tests and local fallback
├── go.mod
└── openapi.yaml
```

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `IRIS_API_ADDR` | HTTP listen address | `:8080` |
| `DATABASE_URL` | PostgreSQL connection string. When set, Postgres is used and `DATABASE_PATH` is ignored. See `deploy/POSTGRES.md`. | empty |
| `DATABASE_PATH` | SQLite database path. Docker uses `/data/iris.db`. | `./data/iris.db` outside production |
| `IRIS_DB_PATH` | Legacy SQLite database path fallback when `DATABASE_PATH` is empty. | empty |
| `IRIS_ENV` | Runtime environment. `production` requires an explicit database path, sets `Secure` cookies and turns off the dev-only localhost CORS fallback. | `development` |
| `IRIS_SESSION_SECRET` | Unused (reserved). Session tokens are random and stored hashed, so nothing is signed; a value left by older deployments is accepted and ignored. | empty |
| `IRIS_ALLOWED_ORIGINS` | Comma-separated CORS origins. Empty allows local dev origins. | empty |
| `IRIS_WEB_DIR` | Static web build directory for SPA fallback. | empty |
| `IRIS_CHROME_PATH` | Chrome/Chromium binary used to render work-order PDFs (`GET /work-orders/{id}/report`). When empty the usual names (`chromium`, `chromium-browser`, `google-chrome`, …) are searched on `$PATH`; when nothing is found the endpoint answers `503` instead of rendering. | empty |
| `IRIS_DEMO_ADMIN_PASSWORD`, `IRIS_DEMO_OPERATOR_PASSWORD` | Passwords for the demo organization's `admin` / operator logins, read by `irisctl seed-demo`. Required in production (12+ characters, not a public demo password); outside production the public demo passwords are kept. Nothing on server start reads them — the demo org is created only when you run `seed-demo`. | empty |
| `IRIS_DEMO_ID_PREFIX` | Prefix added to the demo **fixture** record ids by `irisctl seed-demo` (same as `-id-prefix`). Set it (e.g. `demo-`) when the database already holds another tenant seeded from the same fixed ids (customers `cust-N`, work orders `1`…), such as a real Grafika Čobanović data set, so the demo org can coexist without an id collision. | empty |

## Commands

Run commands from `iris-api/`.

```bash
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
# Demo organization: fixture work orders + "Procesi rada"/"Magacin" content, both
# modules on (non-production only). Idempotent; see the note below.
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
# Real Grafika Čobanović data set (≈2657 clients, ≈3575 catalog items). The data
# is large and NOT committed — generate it first from the legacy export (see
# internal/seed/cobanovic/), then load it:
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-cobanovic
DATABASE_PATH=./data/iris.db go run ./cmd/server
```

Operational commands:

```bash
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl create-tenant -slug grafika-cobanovic -name "Grafika Čobanović" -admin-username milica -admin-password '<secret>'
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl create-user -tenant grafika-cobanovic -username milica -password '<secret>' -role admin
# Backoffice (/backoffice) superadmins, kept apart from organization users. A database
# with none gets admin / admin123321, which must pick a new password (>= 12 chars) on
# first login. Superadmins can also impersonate any organization user from the
# Backoffice (1 h session, audited in impersonation_events, every change traced in
# impersonation_actions) and create, edit, suspend organizations and reset user
# passwords from its "Organizacije" tab; all of it is logged under "Aktivnost". Impersonation
# needs a short reason. Superadmins are listed, added (temporary password) and disabled in
# the "Superadmini" tab, and can turn on TOTP two-factor sign-in from the menu. More accounts:
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl create-platform-admin -username ops -password '<long secret>'
# Lost authenticator and recovery codes: turn two-factor sign-in off for that superadmin
# (signs it out; it can enroll again). Recorded in "Aktivnost" as irisctl.
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl reset-platform-2fa -username ops
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-csv --dry-run --dir ./imports
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-csv --apply -tenant grafika-cobanovic --dir ./imports
# Optional per-organization modules (off by default; "processes" requires "stock"):
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl set-modules -tenant grafika-cobanovic -stock on -processes on
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl backup -out ./backups/iris.db
# Warehouse opening balance / stock count from a CSV (code,quantity[,note]):
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-stock -tenant grafika-cobanovic --file ./stock.csv --dry-run
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-stock -tenant grafika-cobanovic --file ./stock.csv --apply
```

`create-user` requires `-tenant <slug>`; `import-csv --apply` writes rows and also
requires `-tenant <slug>` (a `--dry-run` only validates CSV shape). `import-stock` always
needs `-tenant` (it matches CSV codes against the catalog); `--apply` posts a stock count as
user `irisctl` (opening movements for articles without stock history) and reports unknown codes.

`set-modules -tenant <slug> [-processes on|off] [-stock on|off]` switches an organization's
optional modules ("Procesi rada" needs "Magacin"; an omitted flag stays as it is). Unlike the
Backoffice (`PUT /platform/tenants/{slug}/modules`) it writes no audit row. Both modules are off
for new organizations by default; with a module off its routes answer `403`, new orders get no
auto-attached process and the catalog's `stockOnHand` is `null`. Work-order processes post/reserve
stock only if they were created while stock was on, so enabling stock later never posts retroactively.
(`seed-demo`, below, turns both modules on for the `demo` organization it builds.)

`seed-demo` creates the single `demo` organization ("Demo Štamparija") and fills it in two halves
against one tenant. First the fixture data set from `testdata/fixtures` — the `admin` login
(`admin` / `admin123`) with four operator logins, customers, locations and 43 plain work orders with
no process (modules are still off at this point). Then it turns on both modules and adds, through the
real store methods: an `operater` login (`operater` / `operater123`), customers and services, 10
articles with minimum stock, an opening balance (stock count) and three goods receipts, four process
templates (default "Offset štampa", "Digitalna štampa", "Brošura sa šivenjem" with an intermediate
product and parallel steps, "Veliki format (baner)") and eight process-driven work orders (2 new, 2 in
progress with one actual quantity above plan, 2 completed, 1 whose planned paper exceeds stock, 1
cancelled), with step progress posted so consumption and production movements come from the normal
posting logic. Article codes and order numbers are unique per tenant, so the fixtures are seeded first
and these orders take the next free `RN-<year>-<seq>` numbers after them. It is idempotent: the fixture
half re-upserts and the process/stock content is added only once (a re-run reports it is already
present and leaves it untouched). The Backoffice default account is created on the first server start.

Outside production the logins use the public demo passwords (`admin` / `admin123`, `operater` /
`operater123`). In production a server refuses to start when any tenant has the demo `admin` /
`admin123` login, so `seed-demo` requires strong passwords there: set `IRIS_DEMO_ADMIN_PASSWORD` and
`IRIS_DEMO_OPERATOR_PASSWORD` (or pass `-admin-password` / `-operator-password`), at least 12
characters and not a public demo password. The admin password replaces the fixture admin's; the
operator password replaces every non-admin login's (the fixture operators and the content `operater`).

The fixture half uses fixed record ids (`cust-1`, `loc-1`, work order `1`, …) and record ids are
globally unique, so if the database already holds another tenant seeded from the same ids — e.g. the
real Grafika Čobanović data, whose customers are also `cust-N` — the plain seed collides. Pass
`-id-prefix demo-` (or set `IRIS_DEMO_ID_PREFIX`) to namespace the fixture ids and their references so
the demo org coexists with that tenant. The process/stock half already uses its own `cust-demo-*` /
`cat-demo-*` ids and is unaffected.

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
not commit that file; keep production values such as `IRIS_ALLOWED_ORIGINS` or
the demo passwords only on the server.

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
docker compose run --rm --entrypoint irisctl iris-api create-user -tenant demo -username milica -password '<secret>' -role admin
```

The image ships both binaries — the server (`iris-api`, the entrypoint) and the
`irisctl` operations CLI — so the same `--entrypoint irisctl` form works against
the production compose file too (migrations, seeding, backups), reusing the
backend's `/data` volume and environment:

```bash
docker compose -f docker-compose.prod.yml run --rm --entrypoint irisctl backend seed-demo -id-prefix demo-
```

Migrations run idempotently on startup before the API begins serving. A fresh
PostgreSQL database is created at the consolidated v12 schema and stamped as
such; migrations 13+ are shared by both engines.
They create missing tables and indexes without destructive rebuilds.

## Local Smoke Checks

```bash
curl -i http://localhost:8080/healthz

curl -i -c /tmp/iris.cookies \
  -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"orgSlug":"demo","username":"admin","password":"admin123"}'

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
