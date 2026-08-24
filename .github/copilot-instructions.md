# Iris - Copilot Instructions

Iris is the operations workspace for **Stamparija Cobanovic** (a print shop):
work-order lifecycle, customers/locations, dashboard reporting, and public
tracking. Two deployable surfaces share **one Go REST API** and **one SQLite
database**:

| Surface | Path | Role |
|-------|------|------|
| API | `iris-api/` | Go HTTP service, auth, persistence, OpenAPI contract, optional static web hosting |
| Web | `apps/web/` | Vite + React browser ops UI + public tracking |

Start from the source nearest the area you change:

- Workspace overview: [REPO_MAP.md](../REPO_MAP.md) (verified onboarding snapshot — trust this first)
- Web: [apps/web/README.md](../apps/web/README.md)
- Backend contract: [iris-api/README.md](../iris-api/README.md), [iris-api/openapi.yaml](../iris-api/openapi.yaml)
- Domain: [docs/DOMAIN_GLOSSARY.md](../docs/DOMAIN_GLOSSARY.md), [docs/DECISIONS.md](../docs/DECISIONS.md)

> `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` partly predate the SQLite
> API. When they conflict with `REPO_MAP.md`, `openapi.yaml`, or the Go/web
> source, trust the latter.

## Workspace boundaries

- Logical monorepo with **no root `package.json`.** Each frontend app installs/runs
  independently (npm); `iris-api` is a separate Go module.
- Keep Go server concerns out of `apps/*`; keep React concerns out of `iris-api`.
- Canonical data path: HTTP to `iris-api` with the `iris_session` cookie. Web calls
  `window.api` (installed by `apps/web/src/lib/web-api.ts`); components never call
  `fetch()` directly.
- Treat each surface as a separate task unless the user explicitly combines them.

## Contract-sync rule (most important invariant)

A shared domain/shape change (e.g. a `WorkOrder` field) must land together across:

1. `iris-api/openapi.yaml` — public HTTP contract (source of truth)
2. `iris-api/internal/domain/types.go`
3. `iris-api/internal/store/sqlite.go` + `migrations.go` (if persisted)
4. fixtures + tests (`iris-api/testdata/fixtures/`, `internal/store/fixtures.go`)
5. `apps/web/src/types/work-order.ts` (+ `apps/web/src/fixtures/`)

New required fields also need a default where the web client normalizes data
(`apps/web/src/lib/api-client.ts` / `fixture-api.ts` `normalizeWorkOrder()`) and a
default for existing rows in the migration.

## Backend (`iris-api/`)

Go 1.26, `chi` router, `modernc.org/sqlite`. **SQLite-backed and stateful** (not
fixture-backed at runtime; fixtures are for tests/`seed-demo`).

- `cmd/server/` and `cmd/irisctl/`: process wiring only.
- `internal/api/`: router, auth middleware, thin handlers.
- `internal/domain/`: request/response/domain structs.
- `internal/store/`: SQLite store, migrations, seed; fixture store for tests.
- Endpoint change → update `openapi.yaml`, `internal/api/server.go`,
  `internal/api/server_test.go` together. Run `go mod tidy` on dep changes.
- Auth: `POST /auth/login` takes `{ orgSlug, username, password }`, resolves the
  tenant by slug, and issues an HTTP-only `iris_session` cookie; `requireAuth` /
  `requireAdmin` guard protected and destructive routes.
- **Multi-tenant:** every row is scoped to a tenant. `requireAuth` puts the tenant
  in context (`store.ContextWithTenant`); store methods filter by `tenant_id` via
  `tenantFromContext` (missing tenant → `ErrNoTenant`). New root tables need a
  `tenant_id` FK + per-tenant uniqueness. `irisctl create-tenant` provisions orgs;
  `create-user` / `import-csv --apply` need `-tenant <slug>`.
- **Org settings:** `GET`/`PUT /settings` back the admin Settings page, stored in
  the key/value `app_settings` table (no migration to add a key; missing row →
  coded default). Keep `OrganizationSettings` synced across openapi, domain types,
  and `apps/web/src/types/settings.ts`; use the `add-settings-flag` skill.

```bash
# from iris-api/
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
DATABASE_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
go test ./...   # or narrow: go test ./internal/api
```

## Web (`apps/web/`)

Vite 8 + React 19 + TS ~6 + Tailwind v4.

- `src/lib/web-api.ts` installs `window.api`; mode via `VITE_IRIS_API_MODE`
  (`http` → `api-client.ts`; `fixtures` dev-only → in-memory store from
  `src/fixtures/`). Source data through `window.api.*`/hooks, never raw `fetch()`.
- Feature folders under `src/components/<Feature>/`; shadcn primitives in
  `src/components/ui/`. Hooks in `src/hooks/`. Pages in `src/pages/` (incl.
  `PublicWorkOrderPage`, `CustomersPage`).
- Dashboard aggregates client-side in `src/lib/dashboard/aggregations.ts` (pure,
  tested). Forms: `react-hook-form` + `zod`.

```bash
# from apps/web/
npm install && npm run dev   # :5173
npm run lint && npm test && npm run build
```

## Conventions (all surfaces)

- Code, filenames, comments, tests, internal docs: **English**.
- Visible UI text and auth messages: **Serbian (`sr-Latn`)**.
- Dates: `YYYY-MM-DD` stored, `DD.MM.YYYY` displayed.
- Reuse `components/ui/` (shadcn) before new primitives; Tailwind v4.

## Pitfalls

- Authorization gating in clients is **UI-only** (`role === 'admin'`) — not a
  security boundary; the API enforces session + admin on destructive routes.
- API normalizes legacy statuses (`draft`/`active`).
- No automated CI beyond a manual Copilot setup workflow — run per-surface checks
  yourself. Demo seed creds (non-prod): org `demo`, `admin` / `admin123`.
