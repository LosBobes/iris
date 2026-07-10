# Iris API — backend guidance

Scope: everything under `iris-api/`. Start with
[README.md](README.md) and [openapi.yaml](openapi.yaml). Treat the desktop docs
as secondary for backend-only tasks.

Stack: Go 1.26, `chi` router, `modernc.org/sqlite`, `golang.org/x/crypto`.
The API is **SQLite-backed and stateful** (not fixture-backed at runtime — that
note in older docs is stale; fixtures are for tests and `seed-demo`).

## Boundaries

- Work inside `iris-api/` unless the task explicitly includes coordinated client
  updates.
- No Electron, preload, or React concerns in Go code.
- Keep `cmd/server/main.go` and `cmd/irisctl/main.go` as process wiring only.

## Layering

| Path | Role |
| --- | --- |
| `cmd/server/` | HTTP server wiring |
| `cmd/irisctl/` | CLI: migrate, seed-demo, create-tenant, import-csv, create-user, backup |
| `internal/api/` | chi router, auth middleware, handlers (thin) |
| `internal/domain/` | Go structs — contract with OpenAPI |
| `internal/store/` | SQLite store, migrations, seed; fixture store for tests |
| `internal/reports/` | work-order PDF generation |
| `internal/testutil/` | shared test helpers |

Keep handlers thin; data access lives in `internal/store/`. Don't add new
abstraction layers or frameworks unless the task actually needs one — prefer the
existing chi + stdlib patterns.

## Contract changes

`openapi.yaml` is the public HTTP contract. When an endpoint changes, update
together:

- `openapi.yaml`
- `internal/api/server.go`
- `internal/api/server_test.go`

If request/response shapes change, also update `internal/domain/types.go`. If
persisted behavior changes, update `internal/store/sqlite.go` + `migrations.go`
(and `fixtures.go` + tests for the fixture store). Shape changes ripple to the
clients — see the contract-sync rule in the root [CLAUDE.md](../CLAUDE.md); call
out required web/desktop follow-up rather than leaving drift.

## Auth & data rules

- `POST /auth/login` takes `{ orgSlug, username, password }`, resolves the tenant
  via `TenantBySlug`, authenticates within it, then issues an HTTP-only
  `iris_session` cookie (12h default). Unknown org and bad credentials return the
  **same** generic Serbian error. Protected routes use `requireAuth`; admin-only
  routes use `requireAdmin`.
- **Multi-tenancy:** `requireAuth` attaches the tenant to the request context
  (`store.ContextWithTenant(ctx, user.TenantID)`); every store method reads it via
  `tenantFromContext` and filters by `tenant_id`, returning `ErrNoTenant` if it is
  missing (fail-loud). `locations` are scoped through their parent customer. New
  root tables must carry a `tenant_id` FK and per-tenant uniqueness (see migration
  v10 `tenantIsolationMigration`). `irisctl create-user` / `import-csv --apply`
  require `-tenant <slug>`.
- User-facing auth messages that mirror client behavior stay in Serbian. Code,
  comments, tests, internal docs: English.
- Production (`IRIS_ENV=production`) requires an explicit DB path + session secret
  and blocks the demo `admin`/`admin123` account.

## Commands (run from `iris-api/`, not repo root)

Use the narrowest useful check first, then widen:

```bash
go test ./internal/api
go test ./internal/store
go test ./...
DATABASE_PATH=./data/iris.db go run ./cmd/server
```

Run `go mod tidy` when dependencies change.
