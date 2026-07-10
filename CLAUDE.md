# Iris

Operations workspace for **Stamparija Cobanovic** (a print shop): work-order
lifecycle, customers/locations, dashboard reporting, public tracking, and
admin-configurable organization settings. The system is **multi-tenant** — every
row is scoped to a tenant (organization) and login requires an organization slug.

Three deployable surfaces share **one Go REST API** and **one SQLite database**:

| Surface | Path | Role |
| --- | --- | --- |
| API | `iris-api/` | Go HTTP service, auth, persistence, OpenAPI contract, optional static web hosting |
| Web | `apps/web/` | Vite + React browser ops UI + public tracking |
| Desktop | `apps/desktop/` | Electron app for on-prem shop terminals |

**Start here for any task:** [REPO_MAP.md](REPO_MAP.md) is the verified onboarding
snapshot (architecture, data flow, env vars, risks). Then read the source nearest
the area you are changing:

- Web: [apps/web/README.md](apps/web/README.md), [apps/web/CLAUDE.md](apps/web/CLAUDE.md)
- Desktop: [apps/desktop/README.md](apps/desktop/README.md), [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md)
- Backend: [iris-api/README.md](iris-api/README.md), [iris-api/openapi.yaml](iris-api/openapi.yaml), [iris-api/CLAUDE.md](iris-api/CLAUDE.md)
- Domain: [docs/DOMAIN_GLOSSARY.md](docs/DOMAIN_GLOSSARY.md), [docs/DECISIONS.md](docs/DECISIONS.md)

> Note: `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` are still desktop-first
> and partly predate the SQLite API. When they conflict with `REPO_MAP.md`,
> `iris-api/openapi.yaml`, or the Go/web source, trust the latter.

## Workspace boundaries

- This is a **logical monorepo with no root `package.json`.** Each app installs
  and runs independently (`npm` per frontend app, Go modules in `iris-api/`).
- Keep Go server concerns out of `apps/*`; keep Electron/IPC and React concerns
  out of `iris-api/`.
- The canonical data path is HTTP to `iris-api` with the `iris_session` cookie.
  The web client calls `window.api` (installed by `src/lib/web-api.ts`); the
  desktop renderer calls `window.api` via the preload bridge → main `IrisApiClient`.
- Treat each surface as a separate task unless the user explicitly combines them.

## The contract-sync rule (most important repo invariant)

A domain/shape change (e.g. a `WorkOrder` field) must be applied together across
**all** of these or the surfaces drift silently:

1. `iris-api/openapi.yaml` — the public HTTP contract (source of truth)
2. `iris-api/internal/domain/types.go` — Go structs
3. `iris-api/internal/store/` — SQLite store + `migrations.go` if persisted
4. `apps/web/src/types/work-order.ts`
5. `apps/desktop/model/work-order.ts`
6. Fixtures and tests (`iris-api/testdata/fixtures/`, app fixtures)

Use the `update-api-contract` skill for endpoint/contract changes, and
`sync-domain-contract` for a new shared domain field. **Organization settings**
follow a parallel rule (`OrganizationSettings` in openapi + domain types ↔
`apps/web/src/types/settings.ts` ↔ `apps/desktop/model/settings.ts`), but live in
the key/value `app_settings` table and need **no migration** — use the
`add-settings-flag` skill to add one and sweep every dependent UI surface. If a
change only touches one surface, do not preemptively rewire the others — but never
leave a shared shape inconsistent.

## Conventions (all surfaces)

- Code identifiers, filenames, comments, tests, and internal docs: **English**.
- Visible/user-facing UI text and auth messages: **Serbian (`sr-Latn`)**.
- Dates stored as `YYYY-MM-DD`, displayed `DD.MM.YYYY`.
- Forms use `react-hook-form` + `zod`. Reuse `components/ui/` (shadcn) primitives
  before creating new ones. Tailwind v4.

## Commands

```bash
# Backend (from iris-api/)
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
DATABASE_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
go test ./...                      # or narrow: go test ./internal/api

# Web (from apps/web/)
npm install && npm run dev         # :5173
npm run lint && npm test && npm run build

# Desktop (from apps/desktop/)
npm install && npm run dev
npm run typecheck && npm test && npm run lint && npm run build
```

There is **no automated CI** beyond a manual Copilot setup workflow — run the
relevant per-surface checks yourself before declaring work done.

## Known pitfalls

- Access control gating in the clients is **UI-only** (`role === 'admin'`); the
  API enforces session + admin on destructive routes. Don't treat the UI check as
  a security boundary.
- **Dual frontend duplication:** `apps/web` and `apps/desktop/src/renderer` have
  parallel components/hooks/dashboard libs. A shared change often needs two edits.
- Feature parity gap: web has customers CRUD + public tracking; desktop stops at
  work orders + dashboard.
- API normalizes legacy statuses (`draft`/`active`) for old fixtures.
- **Multi-tenancy:** login takes `{ orgSlug, username, password }`; store queries
  are scoped by the tenant resolved from the session (`tenantFromContext`), and a
  missing tenant returns `ErrNoTenant`. `irisctl create-user` / `import-csv --apply`
  need `-tenant <slug>`; `create-tenant` provisions a new organization.
- Demo seed credentials (non-production only): org `demo`, user `admin`,
  password `admin123`.
