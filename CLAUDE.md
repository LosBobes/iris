# Iris

Operations workspace for **Stamparija Cobanovic** (a print shop): work-order
lifecycle, customers/locations, dashboard reporting, public tracking, and
admin-configurable organization settings. The system is **multi-tenant** — every
row is scoped to a tenant (organization) and login requires an organization slug.

Two deployable surfaces share **one Go REST API** and **one SQLite database**:

| Surface | Path | Role |
| --- | --- | --- |
| API | `iris-api/` | Go HTTP service, auth, persistence, OpenAPI contract, optional static web hosting |
| Web | `apps/web/` | Vite + React browser ops UI + public tracking |

**Start here for any task:** [REPO_MAP.md](REPO_MAP.md) is the verified onboarding
snapshot (architecture, data flow, env vars, risks). Then read the source nearest
the area you are changing:

- Web: [apps/web/README.md](apps/web/README.md), [apps/web/CLAUDE.md](apps/web/CLAUDE.md)
- Backend: [iris-api/README.md](iris-api/README.md), [iris-api/openapi.yaml](iris-api/openapi.yaml), [iris-api/CLAUDE.md](iris-api/CLAUDE.md)
- Domain: [docs/DOMAIN_GLOSSARY.md](docs/DOMAIN_GLOSSARY.md), [docs/DECISIONS.md](docs/DECISIONS.md)

> Note: `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` partly predate the
> SQLite API. When they conflict with `REPO_MAP.md`, `iris-api/openapi.yaml`, or
> the Go/web source, trust the latter.

## Workspace boundaries

- This is a **logical monorepo with no root `package.json`.** Each app installs
  and runs independently (`npm` per frontend app, Go modules in `iris-api/`).
- Keep Go server concerns out of `apps/*`; keep React concerns out of
  `iris-api/`.
- The canonical data path is HTTP to `iris-api` with the `iris_session` cookie.
  The web client calls `window.api` (installed by `src/lib/web-api.ts`).
- Treat each surface as a separate task unless the user explicitly combines them.

## The contract-sync rule (most important repo invariant)

A domain/shape change (e.g. a `WorkOrder` field) must be applied together across
**all** of these or the surfaces drift silently:

1. `iris-api/openapi.yaml` — the public HTTP contract (source of truth)
2. `iris-api/internal/domain/types.go` — Go structs
3. `iris-api/internal/store/` — SQLite store + `migrations.go` if persisted
4. `apps/web/src/types/work-order.ts`
5. Fixtures and tests (`iris-api/testdata/fixtures/`, app fixtures)

Use the `update-api-contract` skill for endpoint/contract changes, and
`sync-domain-contract` for a new shared domain field. **Organization settings**
follow a parallel rule (`OrganizationSettings` in openapi + domain types ↔
`apps/web/src/types/settings.ts`), but live in the key/value `app_settings` table and need **no migration** — use the
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
DATABASE_PATH=./data/iris.db go run ./cmd/server
go test ./...                      # or narrow: go test ./internal/api

# Web (from apps/web/)
npm install && npm run dev         # :5173
npm run lint && npm test && npm run build
```

Apart from the PR changeset check (below), there is **no automated CI** — run the
relevant per-surface checks yourself before declaring work done.
The `iris-guards` mod (`.claude/skills/iris-guards/`) backs this up: it runs
those checks before any `git push`, flags contract-sync drift after contract
edits, and blocks production/destructive commands the user did not ask for.

## Versioning (every PR)

The app version is the root `VERSION` file (semver, started at `1.0.0`) and is
shown on the login screen. **Every PR must add a changeset** — a
`.changeset/*.md` file with `bump: patch|minor|major` front matter and a
plain-text description — or the `Changeset` PR check fails:

```bash
node scripts/changeset.mjs add minor "Work orders can now be duplicated."
```

On merge to `main`, `build.yml` applies pending changesets: bumps `VERSION` by
the highest level, prepends them to `CHANGELOG.md`, commits and tags `vX.Y.Z`.
Never edit `VERSION` or released `CHANGELOG.md` entries by hand. Details:
[.changeset/README.md](.changeset/README.md).

## Known pitfalls

- Access control gating in the clients is **UI-only** (`role === 'admin'`); the
  API enforces session + admin on destructive routes. Don't treat the UI check as
  a security boundary.
- API normalizes legacy statuses (`draft`/`active`) for old fixtures.
- **Sign-in is two-step:** `/login` asks for the organization slug and validates it
  via `GET /public/organizations/{slug}`; the device remembers it and goes to
  `/login/<slug>` (username + password, plus the org's admin-editable logo from
  `PUT /settings/login-logo`, stored in `app_settings` under `login_logo`).
- **Backoffice (`/backoffice`, API `/platform/*`):** opened by tapping the "Iris"
  wordmark on the org picker 5× within 3 s (a convenience, not security). Only
  `superadmin` accounts get in; they live in `platform_admins`, fully separate from
  organization `users` (own sessions, `iris_platform_session` cookie, 2 h; neither
  side's credentials or sessions work on the other). A database with none gets
  `admin` / `admin123321`, which must change its password before anything shows
  (in-app "Lozinka"; `irisctl create-platform-admin` adds more). The dashboard
  reads aggregate counts from `GET /platform/metrics`; tenant logins are recorded
  in `login_events` for those counts. **Impersonation** ("Uđi kao…" per
  organization) is its only way into records: `POST /platform/tenants/{slug}/impersonate`
  issues an ordinary `iris_session` (1 h) for the chosen user, marked
  `sessions.impersonated_by` and audited in `impersonation_events`; `/auth/session`
  reports `impersonatedBy`, which drives the app's top banner ("Prekini
  impersonaciju" logs out back to `/backoffice`). It is not counted as a login,
  and signing out of the Backoffice ends it. Every change request (POST/PUT/
  PATCH/DELETE, not edit-lock heartbeats, never bodies) made in such a session is
  traced to it in `impersonation_actions` (`serveTraced` in `requireAuth`).
  New mutating routes should get a label in `components/platform/impersonation-actions.ts`.
  **Organization management** ("Organizacije" tab, `/platform/tenants…`): create
  (with first admin), rename / change slug, suspend / reactivate (`tenants.suspended_at`:
  ordinary sessions end and sign-in is refused, impersonation still works), and
  reset a user's password. Every superadmin operation, impersonations included,
  is written to `platform_audit_events` in the same transaction and shown in the
  "Aktivnost" tab (`GET /platform/audit`; trails at `/platform/impersonations/{id}/actions`).
- **Work-order processes** (D-017): per-tenant `process_templates` (graph of
  `step`/`input`/`product`/`byproduct` nodes, JSON, acyclic) and a per-order copy in
  `work_order_processes` (`/process-templates`, `/work-orders/{id}/process`). Not part
  of the `WorkOrder` shape or its status lifecycle. Admins edit structure; operators
  only step status / actual quantities (structural change → 403). New orders get the
  default template. Backoffice edits templates via `/platform/tenants/{slug}/process-templates`
  (audited). Shape sync: openapi ↔ domain types ↔ `apps/web/src/types/process.ts`.
- **Magacin / stock** (D-018): Iris owns article stock as an append-only
  `stock_movements` ledger (`/stock`, `/stock/movements`, `POST /stock/receipts`,
  admin `POST /stock/counts`; `irisctl import-stock` for the opening balance).
  Process item nodes link to articles (`catalogItemId`); marking a step done posts
  consumption/production automatically (diff of desired vs posted net per node, so
  undo and quantity edits post only the delta). Never edit or delete movements.
- **Modules** (D-019): `stock` and `processes` are per-organization toggles, **off by
  default**; `processes` requires `stock`, switched only in the Backoffice (`PUT /platform/tenants/{slug}/modules`,
  `app_settings` key `modules`; read-only `modules` in `GET /settings`). Disabled
  module routes return 403; gate every new process/stock UI surface on
  `useOrganization().modules` and never call a disabled module's endpoints.
- **Org sessions** (D-020): login takes optional `remember`; tokens are stored
  only as SHA-256 (`sessions.token_hash`, migration v25). Idle expiry slides on
  use (written at most hourly) under an absolute cap — 12 h / 24 h with a
  browser-session cookie, or 7 d / 30 d with a persistent one ("Zapamti me na
  ovom uređaju"). Sign-in failures are throttled (429); a password change ends
  the user's other sessions; mutating requests with a foreign `Origin` get 403.
  `IRIS_SESSION_SECRET` is unused (ignored if set).
- **Multi-tenancy:** login takes `{ orgSlug, username, password }`; store queries
  are scoped by the tenant resolved from the session (`tenantFromContext`), and a
  missing tenant returns `ErrNoTenant`. `irisctl create-user` / `import-csv --apply`
  need `-tenant <slug>`; `create-tenant` provisions a new organization.
- Demo seed (`irisctl seed-demo`): one `demo` org with both modules **on**.
  Logins `admin` / `admin123` (+ four fixture operators) and `operater` /
  `operater123`. It loads the `testdata/fixtures` work orders (no process) first,
  then adds process- and stock-driven content (4 templates, 8 orders, warehouse
  stock) that takes the next order numbers after the fixtures. Idempotent: the
  content is added once (a re-run reports it already present). In production the
  server refuses to start on the demo `admin`/`admin123` login, so `seed-demo`
  requires `IRIS_DEMO_ADMIN_PASSWORD` / `IRIS_DEMO_OPERATOR_PASSWORD` (12+ chars)
  there — `store.DemoPasswords` enforces it.
