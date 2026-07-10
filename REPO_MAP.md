# Iris - Repository Map

Onboarding snapshot for senior engineers. **Last verified:** 2026-07-10.

## 1. What this app does

**Iris** is the operations workspace for **Stamparija Cobanovic** (a print shop). It manages:

- **Work orders** - lifecycle from `new` through `invoiced`, with assignment, materials, notes, events, invoice drafts, order-number reservation, and a per-order edit lock
- **Customers and locations** - normalized master data (web client; API-backed)
- **Dashboard** - revenue/status charts and queue summaries (aggregated client-side)
- **Public tracking** - token-based status lookup at `/public/work-orders/:token` (web only)
- **Organization settings** - admin-configurable, shop-wide defaults (firm name, PDF sections, billing/priority defaults, shipping-options toggle)

The system is **multi-tenant**: every row is scoped to a **tenant** (an isolated
organization / shop). Users log in with an **organization slug** plus username +
password; all data access is filtered by the tenant resolved from the session.
See [§4a](#4a-multi-tenancy). The seeded production tenant is `grafika-cobanovic`
(Grafika Čobanović); the demo tenant is `demo`.

Three deployable surfaces share one **Go REST API** and **SQLite** database:

| Surface | Path | Role |
| --- | --- | --- |
| Desktop | `apps/desktop` | Electron app for on-prem shop terminals |
| Web | `apps/web` | Browser ops UI + public tracking |
| API | `iris-api` | Auth, persistence, OpenAPI contract, optional static web hosting |

---

## 2. Runtime, framework, language, package manager

| Layer | Stack |
| --- | --- |
| **Backend** | Go **1.26**, `chi` router, `modernc.org/sqlite`, `golang.org/x/crypto` |
| **Web** | **Vite 8**, **React 19**, **TypeScript ~6**, **Tailwind CSS 4**, Vitest, ESLint |
| **Desktop** | **Electron 39**, **electron-vite 5**, React 19, TS 5.9, Tailwind 4, Vitest, electron-builder |
| **Package managers** | **npm** per frontend app (`package-lock.json` in `apps/web`, `apps/desktop`); **Go modules** in `iris-api/` |
| **Monorepo** | Logical monorepo; **no root `package.json`**. Each app is installed and run independently. |

**Production runtime:** single **distroless** Docker image builds `iris-api` + embedded `apps/web/dist`; serves API and SPA from one process on `:8080`.

---

## 3. Important directories

```text
iris/
├── apps/
│   ├── desktop/                 Electron: main / preload / renderer
│   │   ├── config/                dev vs prod API defaults
│   │   ├── model/                 Desktop domain types (mirror API)
│   │   └── src/
│   │       ├── main/              IPC handlers, IrisApiClient, runtime-config
│   │       ├── preload/           window.api bridge (typed)
│   │       └── renderer/src/      React UI (pages, hooks, dashboard lib)
│   └── web/                       Vite SPA
│       └── src/
│           ├── components/        Feature UI + shadcn primitives
│           ├── fixtures/          In-browser fixture mode seed JSON
│           ├── hooks/             useAuth, useWorkOrders, useDashboardData
│           ├── lib/               api-client, fixture-api, web-api bootstrap
│           ├── pages/             Routes (incl. public tracking, customers)
│           └── types/             TypeScript domain types
├── iris-api/
│   ├── cmd/server/                HTTP server wiring
│   ├── cmd/irisctl/             migrate, seed-demo, create-tenant, import-csv, users, backup
│   ├── internal/api/            Routes, auth middleware, handlers
│   ├── internal/domain/         Go structs (contract with OpenAPI)
│   ├── internal/store/          SQLite + fixture store (tests)
│   ├── testdata/fixtures/       JSON fixtures for tests / seed-demo source
│   └── openapi.yaml             HTTP contract (source of truth with domain types)
├── docs/                          ARCHITECTURE, DECISIONS, DOMAIN_GLOSSARY, CONTRIBUTING
├── .github/                       Copilot/agent prompts; minimal CI (Copilot setup only)
├── Dockerfile                     Multi-stage: Go API + web build → distroless
└── docker-compose.yml             Local API + SQLite volume
```

**Contract sync points** (change together): `iris-api/openapi.yaml`, `iris-api/internal/domain/types.go`, `apps/web/src/types/work-order.ts`, `apps/desktop/model/work-order.ts`, fixtures, and tests. Shared **settings** shapes live in `apps/web/src/types/settings.ts` ↔ `apps/desktop/model/settings.ts` and mirror the `OrganizationSettings` schema.

---

## 4. Data flow

### Authenticated API path (canonical)

```text
Client (web or desktop renderer)
  → window.api
  → [desktop only: preload IPC → main IrisApiClient]
  → HTTP + credentials (iris_session cookie)
  → iris-api (chi → handler → store.Store)
  → SQLite (DATABASE_PATH)
```

### Web boot (`apps/web/src/lib/web-api.ts`)

- `VITE_IRIS_API_MODE=http` → `createHttpApi(baseUrl)` → `fetch` with `credentials: 'include'`
- `VITE_IRIS_API_MODE=fixtures` (dev only) → in-memory store from `src/fixtures/`

### Desktop boot

```text
IRIS_API_BASE_URL (.env or config)
  → runtime-config.ts
  → iris-api-client.ts
  → IPC handlers (workorders:*, auth:login, app:*)
  → preload window.api
  → React hooks/pages
```

### Auth

- `POST /auth/login` takes **`{ orgSlug, username, password }`** → resolves the
  tenant by slug, authenticates the user within it, then issues an HTTP-only
  **`iris_session`** cookie (12h default). Unknown org and bad credentials return
  the **same** generic Serbian error, so the form never reveals which orgs exist.
- Protected routes use `requireAuth`; admin-only routes use `requireAdmin`
- No OAuth / SSO - username/password in SQLite

### 4a. Multi-tenancy

- A **tenant** is an isolated organization/shop. Domain `Tenant{ ID, Slug, Name }`
  (`internal/domain/types.go`); `User.TenantID` is server-side only (`json:"-"`).
- Migration **v10** (`tenantIsolationMigration` in `internal/store/migrations.go`)
  adds a `tenants` table and a `NOT NULL tenant_id` FK to `users`, `customers`,
  `work_orders`, `catalog_items`, `enum_values`, and `app_settings`; existing rows
  are attributed to the seeded **production** tenant. Uniqueness became per-tenant
  (`UNIQUE(tenant_id, username)`, `(tenant_id, order_number)`, `(tenant_id, code)`,
  `(tenant_id, field, value)`, and `app_settings` PK `(tenant_id, key)`).
  `locations` has no `tenant_id` — it is scoped through its parent customer.
- The tenant flows **session → context → store**: `requireAuth` calls
  `store.ContextWithTenant(ctx, user.TenantID)`; store methods read it via
  `tenantFromContext` and filter every query by `tenant_id`. A method called with
  no tenant in context returns `ErrNoTenant` (fail-loud, not a silent cross-tenant leak).
- Manage tenants with `irisctl create-tenant`; `create-user` and `import-csv --apply`
  now require `-tenant <slug>` (see §5).

### Dashboard analytics

- Clients fetch **raw work orders**, then aggregate in `*/lib/dashboard/` (pure functions, unit-tested). Not computed on the server.

### Public tracking (web)

- Unauthenticated `GET /public/work-orders/{token}` - response strips internal fields

### Work-order concurrency

- **Edit lock** (`POST`/`DELETE /work-orders/{id}/edit-lock`, migration v12): one
  operator holds an exclusive, auto-expiring lock (TTL 2 min). Clients heartbeat
  every 30 s (`useWorkOrderEditLock`) and release on unmount. A busy order returns
  **409** with the current holder's identity; the hook **fails open** (stays
  editable on error) and only marks the form read-only when another operator holds it.
- **Order-number reservation** (`POST /work-orders/reserve-number` /
  `release-number`, migration v11, 12h TTL): the create form can show the next
  `RN-<year>-<seq>` (5-digit) number before save.

### Organization settings

- `GET`/`PUT /settings` back the admin **Settings** page. Values are stored per
  tenant in the key/value `app_settings` table (adding a key needs **no migration** -
  a missing row falls back to a coded default). Current settings: `firmName`,
  `pdfSections`, `billingDefaults { documentType, allowOverride }`,
  `priorityDefaults { priority, allowOverride }`, and `showShippingOptions`.
  `OrganizationSettingsUpdate` uses optional/pointer fields (nil = "leave unchanged").
- Web surfaces them through `OrganizationContext`; desktop mirrors the **types only**
  (the toggles are web-only). See the `add-settings-flag` skill.

---

## 5. Run, test, lint, build, deploy

### Prerequisites

- **Node.js 18+** (Docker web build uses Node 24)
- **Go 1.26+**
- For desktop dev: OS that can run Electron

### Backend (`iris-api/`)

```bash
cd iris-api
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
DATABASE_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
```

| Task | Command |
| --- | --- |
| Test | `go test ./...` |
| Create tenant | `go run ./cmd/irisctl create-tenant -slug … -name … [-admin-username … -admin-password …]` |
| CLI user | `go run ./cmd/irisctl create-user -tenant <slug> -username … -password … -role admin` |
| CSV import | `go run ./cmd/irisctl import-csv --dry-run\|--apply [-tenant <slug>] --dir ./imports` (`--apply` needs `-tenant`) |
| Backup | `go run ./cmd/irisctl backup -out ./backups/iris.db` |

### Web (`apps/web/`)

```bash
cd apps/web && npm install && npm run dev    # :5173
npm run lint && npm test && npm run build
npm run preview                             # production build preview
```

### Desktop (`apps/desktop/`)

Create `apps/desktop/.env`:

```env
IRIS_API_BASE_URL=http://localhost:8080
```

```bash
cd apps/desktop && npm install && npm run dev
npm run typecheck && npm test && npm run lint && npm run build
npm run build:mac|build:win|build:linux     # electron-builder artifacts
```

### Docker (API + embedded web)

```bash
# repo root; optional root .env for IRIS_SESSION_SECRET, IRIS_ALLOWED_ORIGINS
docker compose up -d --build
docker compose run --rm --entrypoint irisctl iris-api seed-demo
curl http://localhost:8080/healthz
```

- DB: volume `iris_sqlite_data` → `/data/iris.db`
- **Avoid** `docker compose down -v` unless wiping data
- Port override: `IRIS_API_PORT=18080 docker compose up -d --build`

### Verification run (2026-06-03)

| Target | Result |
| --- | --- |
| `iris-api` `go test ./...` | **Pass** (46 tests, 6 packages) |
| `apps/web` lint / test / build | **Pass** (35 tests) |
| `apps/desktop` typecheck / test | **Pass** (54 tests) |
| `apps/desktop` lint | Not confirmed (ESLint hung >60s in this environment) |

**CI gap:** `.github/workflows/` only has manual `copilot-setup-steps` (desktop npm install). No automated monorepo test/lint workflow on push/PR.

---

## 6. Environment variables and config files

### Backend (`iris-api`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_PATH` | **Primary** SQLite path (default dev: `./data/iris.db`) |
| `IRIS_DB_PATH` | Legacy fallback if `DATABASE_PATH` unset |
| `IRIS_ENV` | `development` \| `production` - production requires explicit DB path + session secret; blocks demo `admin`/`admin123` |
| `IRIS_SESSION_SECRET` | Session signing (required in production) |
| `IRIS_API_ADDR` | Listen address (default `:8080`) |
| `IRIS_ALLOWED_ORIGINS` | CORS allowlist (comma-separated) |
| `IRIS_WEB_DIR` | Serve built SPA + fallback routing (Docker: `/app/web`) |

Compose also sets `DATABASE_PATH=/data/iris.db`. Root **`.env`** is read by Compose (gitignored; do not commit secrets).

### Web (`apps/web`)

| File / variable | Purpose |
| --- | --- |
| `.env.example` | Documents `VITE_IRIS_API_MODE`, `VITE_IRIS_API_BASE_URL` |
| `.env.development` | Checked-in dev defaults (`http://localhost:8080`) |
| `VITE_IRIS_API_MODE` | `http` \| `fixtures` |
| `VITE_IRIS_API_BASE_URL` | API origin (prod: same-origin or split API host) |

### Desktop (`apps/desktop`)

| Variable | Purpose |
| --- | --- |
| `IRIS_API_BASE_URL` | API base (via `.env` or `config/development.ts` / `production.ts`) |
| `NODE_ENV` / `ELECTRON_RENDERER_URL` | Dev vs prod config selection |

### Other config

- `iris-api/openapi.yaml` - API contract
- `apps/desktop/electron-builder.yml`, `dev-app-update.yml` - packaging / updater (placeholder metadata)
- `apps/*/eslint.config.*`, `vitest.config.*`, `tsconfig*.json` - tooling per app

---

## 7. External services and integrations

| Integration | Usage |
| --- | --- |
| **SQLite** | Sole production database (`modernc.org/sqlite`); file on disk or Docker volume |
| **HTTP session cookies** | Auth; no JWT/OAuth providers in tree |
| **CORS** | Browser clients on different origin than API |
| **electron-updater** | Desktop auto-update hook (config largely placeholder) |

**Not present:** PostgreSQL, Redis, message queues, S3, Stripe, email/SMS providers, external IdP.

Demo seed credentials (non-production): `admin` / `admin123`.

---

## 8. Risks, unclear areas, technical debt

| Area | Notes |
| --- | --- |
| **Dual frontend duplication** | Large parallel trees (`apps/web` vs `apps/desktop/renderer`) - components, dashboard libs, hooks. Changes often need two edits; no shared UI package. |
| **Client-side authorization** | Admin dashboard gating is UI-only ([D-006](docs/DECISIONS.md) `temporary`). API enforces session + admin on destructive routes, but not all read paths may match product intent. |
| **Feature parity** | Web has **customers** CRUD and **public tracking**; desktop routes stop at work orders + dashboard (no customer IPC surface). |
| **Doc drift** | Some docs still say `IRIS_DB_PATH` as primary; runtime prefers **`DATABASE_PATH`**. `docs/ARCHITECTURE.md` / `docs/CONTRIBUTING.md` remain desktop-first and partly predate the SQLite API and multi-tenancy - trust `REPO_MAP.md`, `openapi.yaml`, and the Go/web source when they conflict. |
| **Electron security** | `sandbox: false` in `BrowserWindow`; preload isolation is good, but not hardened to modern Electron defaults. |
| **No monorepo CI** | Regressions rely on manual verification per package. |
| **Legacy statuses** | API accepts/normalizes `draft` / `active` for old fixtures. |
| **Packaging** | `electron-builder.yml` uses placeholder `com.electron.app` / example author; `notarize: false` on macOS. |
| **SQLite ops** | Single-file DB + volume backups - no replication, migration rollback story, or hosted DB runbook in repo. |
| **Contract discipline** | Four+ places must stay aligned on domain changes; easy to miss one in review. |

---

## 9. Suggested first five improvements

1. **Add a GitHub Actions workflow** - matrix: `go test ./...`, `apps/web` lint/test/build, `apps/desktop` typecheck/test (with `ELECTRON_SKIP_BINARY_DOWNLOAD` where needed).
2. **Extract a shared `@iris/contracts` or `packages/shared`** - work-order types, status enums, date helpers, and dashboard aggregation to cut web/desktop drift.
3. **Reconcile documentation** - standardize on `DATABASE_PATH`, update Copilot/desktop README, add root `.env.example` for Compose.
4. **Harden auth story** - document and test server-side rules for admin-only reads; reduce reliance on renderer `role === 'admin'` ([D-006](docs/DECISIONS.md)).
5. **Desktop feature parity or explicit scope** - either expose customers/public flows via IPC + pages, or document desktop as work-order-only and trim duplicate UI investment.

---

## Quick links

- [README.md](README.md) - entry commands
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - topology and flows
- [docs/DOMAIN_GLOSSARY.md](docs/DOMAIN_GLOSSARY.md) - Serbian UI ↔ English code
- [iris-api/README.md](iris-api/README.md) - endpoints and Docker smoke checks
- [apps/desktop/README.md](apps/desktop/README.md) · [apps/web/README.md](apps/web/README.md)
