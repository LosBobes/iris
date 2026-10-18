# Architectural Decisions

This document records the project-level architectural decisions (ADRs) that shape the Iris workspace.

## Status Definitions
- `accepted`: Active architectural decision.
- `temporary`: Active for now, expected to evolve.
- `superseded`: Replaced by a more recent decision.

---

## D-001: Build the primary desktop product as an Electron application
- **Status**: `superseded` (by [D-015](#d-015-retire-the-electron-desktop-client))
- **Context**: The local print shop (Stamparija Cobanovic) operates on-premise physical terminals that require local application reliability and easy operating system integration.
- **Decision**: Wrap the React user interface in an Electron shell (`apps/desktop`), utilizing a multi-process architecture for native operations.
- **Consequences**:
  - The application benefits from native OS window management and desktop packaging.
  - Development requires distinct workflows for privileged main-process concerns and unprivileged renderer interfaces.

---

## D-002: Maintain a strict three-layer Electron split
- **Status**: `superseded` (by [D-015](#d-015-retire-the-electron-desktop-client))
- **Context**: Electron applications combine privileged Node.js APIs and unprivileged browser runtimes, representing a significant security boundary.
- **Decision**: Physically partition `apps/desktop` into:
  - `src/main/` (privileged main process)
  - `src/preload/` (secure runtime context bridge)
  - `src/renderer/src/` (unprivileged React UI)
- **Consequences**:
  - No privileged Node APIs can be direct-imported into React components.
  - Every native operation must be explicitly registered across all three layers, ensuring an audited security posture.

---

## D-003: Communication via typed IPC through `window.api`
- **Status**: `superseded` (by [D-015](#d-015-retire-the-electron-desktop-client))
- **Context**: The desktop React interface must execute actions or request data from the local operating system without violating runtime isolation rules.
- **Decision**: Expose structured functions on the global `window.api` within preload scripts, mapping them via `ipcRenderer.invoke(...)` to `ipcMain.handle(...)` functions in the main process.
- **Consequences**:
  - Eliminates raw IPC string passing inside components.
  - Adds a compile-time contract surface that guarantees type safety across the native bridge.

---

## D-004: Organize codebase by functional feature
- **Status**: `accepted`
- **Context**: Monorepos structured solely by role (e.g. all components in one folder, all types in another) suffer from developer cognitive load as features grow.
- **Decision**: Group components, pages, hooks, tests, and handlers by feature domain (e.g., `WorkOrder/`, `Login/`) rather than component roles.
- **Consequences**:
  - Colocates tests and sub-components, making vertical features easy to edit.
  - Shared domain models continue to reside in unified types directories for cross-feature access.

---

## D-005: Use fixture JSON files as the main data source
- **Status**: `superseded` (by [D-010](#d-010-adopt-a-shared-go-backend-iris-api-as-the-workspace-source-of-truth))
- **Context**: Initial stages of desktop prototyping required simple data loading before an independent backend was built.
- **Decision**: Load customer and work-order records directly from static JSON files in `apps/desktop/fixtures/` using main-process file operations.
- **Consequences**:
  - Allowed rapid UI prototyping without networking overhead.
  - Rendered the database state stateless and transient across client sessions, which did not scale to multi-device or browser operations.

---

## D-006: Client-side dashboard role gating
- **Status**: `temporary`
- **Context**: The print shop requires basic privilege division, ensuring standard staff operators cannot view financial revenue dashboards.
- **Decision**: Store the authenticated operator role in React application state and block dashboard navigation unless `currentUser.role === 'admin'`.
- **Consequences**:
  - Simple, zero-latency dashboard authorization gates in the UI.
  - Not a hard cryptographic boundary. The API now enforces session + admin checks itself; sessions are opaque random tokens stored hashed, not signed cookies, so there is no signing secret ([D-020](#d-020-sliding-organization-sessions-with-an-absolute-cap-stored-hashed)).

---

## D-007: Perform analytical dashboard aggregates in the renderer
- **Status**: `superseded` by [D-016](#d-016-compute-dashboard-aggregates-server-side)
- **Context**: Top client lists, monthly revenue buckets, and order status counts are computed from the same raw work-order dataset.
- **Decision**: Fetch raw work-orders, then perform functional aggregations inside client-side pure functions (`apps/web/src/lib/dashboard/`).
- **Consequences**:
  - Eliminates server load for repetitive analytical reports.
  - Simplifies testing via pure unit tests on simple data inputs.

---

## D-008: Localized UI copy in Serbian (Latin) and code in English
- **Status**: `accepted`
- **Context**: The print-shop staff operates in Serbian, while developer tools, programming conventions, and libraries operate globally in English.
- **Decision**: Program all components, variables, API routes, and database models in English, but display Serbian Latin (`sr-Latn`) labels on visible user screens.
- **Consequences**:
  - Preserves native usability for shop operators.
  - Requires maintaining `docs/DOMAIN_GLOSSARY.md` to map English symbols to Serbian business terms consistently.

---

## D-010: Adopt a Go backend (iris-api) as the workspace source of truth
- **Status**: `accepted` (supersedes [D-005](#d-005-use-fixture-json-files-as-the-current-data-source))
- **Context**: Integrating multiple frontends (both desktop and browser clients) requires a single unified server layer to manage state transitions, validation, and user auth.
- **Decision**: Establish `iris-api` using Go, routing calls via Chi routers, and executing transactions against contract routes declared in `openapi.yaml`. Production runtime uses SQLite selected by `IRIS_DB_PATH`; fixture data under `iris-api/testdata/fixtures` remains available for tests and local fallback mode.
- **Consequences**:
  - Centralizes validation and business rules.
  - Keeps test fixtures decoupled from the desktop app runtime.

---

## D-011: Desktop connection via IPC-HTTP client forwarding
- **Status**: `superseded` (by [D-015](#d-015-retire-the-electron-desktop-client))
- **Context**: The desktop client needs to fetch data from the shared Go backend while maintaining unprivileged React safety.
- **Decision**: Rather than the renderer querying `iris-api` over the network directly, the renderer communicates over IPC to the Electron main process, which executes HTTP calls via a typed `IrisApiClient`.
- **Consequences**:
  - Reinforces the unprivileged boundary of the renderer.
  - Ensures the desktop client utilizes identical backend REST contracts as browser endpoints.

---

## D-012: Dual-mode web runtime client adapter
- **Status**: `accepted`
- **Context**: The web application (`apps/web`) must support instant developer tests, standalone browser sandboxes, and full API connections.
- **Decision**: Implement a client-side API switch in `apps/web/src/lib/web-api.ts`. Depending on `VITE_IRIS_API_MODE`, the app toggles between `http` (direct network requests) and `fixtures` (in-memory simulated mock client).
- **Consequences**:
  - Standalone browser runs require zero external backend processes.
  - Developers can debug complex client flows inside isolated browser contexts.

---

## D-013: Standardize on an expanded work-order domain model
- **Status**: `accepted` (lifecycle later amended by D-014)
- **Context**: Real-world operations need detailed steps beyond basic open/closed statuses-specifically tracking scheduling, materials, client approvals, and invoicing drafts.
- **Decision**: Standardize all monorepo type contracts on a unified print-shop lifecycle (`new`, `assigned`, `inProgress`, `waitingForCustomer`, `waitingForMaterials`, `completed`, `cancelled`, `invoiced`) complete with normalized `Customer`, `Location`, `Assignment`, `InvoiceDraft`, and execution metrics. Legacy `draft` and `active` inputs are normalized at the API boundary where older fixture compatibility requires it.
- **Consequences**:
  - Requires synchronized updates to TypeScript types, Go structs, and OpenAPI definitions when changing schemas.
  - Guarantees rich, operation-grounded dashboard analytics.

---

## D-014: Retire the two "waiting" work-order statuses
- **Status**: `accepted` (amends D-013)
- **Context**: `waitingForCustomer` and `waitingForMaterials` were never reachable through the UI (no control set them; only the single forward "Pomeri u …" transition existed), so they only ever appeared on imported/seed data. They added dashboard signals and lifecycle branches that carried no real operator workflow.
- **Decision**: Remove `waitingForCustomer` and `waitingForMaterials` from the canonical lifecycle, leaving `new → assigned → inProgress → completed → invoiced` with `cancelled` as an off-ramp from any active stage. Cancellation is now a first-class UI action ("Otkaži") on the work-order detail page. The retired values are still accepted from older data and normalized to `inProgress` at the API boundary (alongside legacy `draft`/`active`).
- **Consequences**:
  - The two statuses were removed from the Go domain/store, OpenAPI enums, both TypeScript contracts, badges, dashboard attention signals, fixtures, and seed data.
  - Old persisted rows remain valid: they read back as `inProgress`.

---

## D-015: Retire the Electron desktop client
- **Status**: `accepted` (supersedes [D-001](#d-001-build-the-primary-desktop-product-as-an-electron-application), [D-002](#d-002-maintain-a-strict-three-layer-electron-split), [D-003](#d-003-communication-via-typed-ipc-through-windowapi), [D-011](#d-011-desktop-connection-via-ipc-http-client-forwarding))
- **Context**: `apps/desktop` was never deployed to a shop terminal. It duplicated the web client's components, hooks, and dashboard libraries behind a second `window.api` transport, so every shared change needed two edits, and it always trailed the web client in features (no customers CRUD, no public tracking, no organization settings). Its whole surface — a browser UI over the same REST API — is already served by `apps/web`.
- **Decision**: Delete `apps/desktop` and the Electron-specific tooling around it (the IPC skill, the Electron review agent, the desktop-only Copilot setup step). The web client is the single operator UI; shop terminals run it in a browser against the same `iris-api`.
- **Consequences**:
  - The contract-sync rule loses its desktop legs: a domain change now lands in OpenAPI, Go domain types, the store, `apps/web/src/types/`, and fixtures.
  - No native OS packaging or auto-update path; on-prem terminals need a browser and network reach to `iris-api`.
  - D-002 and D-003 (the main/preload/renderer split and typed IPC) no longer apply to any code in this repo. The `window.api` name survives in `apps/web/src/lib/web-api.ts` as the web client's own transport seam, not as an IPC bridge.

---

## D-016: Compute dashboard aggregates server-side
- **Status**: `accepted` (supersedes [D-007](#d-007-perform-analytical-dashboard-aggregates-in-the-renderer))
- **Context**: Under D-007 the dashboard downloaded every work order (`GET /work-orders?view=summary`, no paging) on each visit. The payload, and the browser's memory and CPU, grew with the shop's whole order history.
- **Decision**: `GET /dashboard` returns the dashboard already aggregated (`iris-api/internal/dashboard`, pure and unit-tested). Filters (`dateFrom`, `dateTo`, `issuedBy`, `companyKey`) and the viewer's local `today` are query parameters. Finance figures are built only for admins (`finance: null` for operators). The TypeScript functions in `apps/web/src/lib/dashboard/` remain as the reference implementation that fixture mode serves.
- **Consequences**:
  - Response size no longer depends on the total number of orders, apart from attention rows, which list only open orders that need action.
  - Cost-derived numbers never reach operator browsers. Before, the API sent operators zeroed costs and the UI hid the section.
  - Two implementations must stay in sync: a behavior change lands in both the Go package and `lib/dashboard/`, with matching tests.
  - Name sorting uses Croatian collation in Go, because x/text's `sr-Latn` falls back to root order. Its Latin alphabet order matches browsers' `sr-Latn`.

---

## D-017: Model work-order processes as a separate graph, not as new statuses
- **Status**: `accepted`
- **Context**: Shops want to model how an order is actually produced: the steps, what each step consumes (inputs), what it yields (products) and what it leaves over (byproducts), with per-order progress. The existing `status` lifecycle (`new` → `invoiced`) drives filters, the dashboard, public tracking and the PDF, so replacing it would ripple through every surface.
- **Decision**: Add per-tenant **process templates** (a directed acyclic graph of `step`, `input`, `product` and `byproduct` nodes) and a per-order **work-order process** (an editable copy of a template graph plus per-order state: step status, actual quantities) in their own tables (`process_templates`, `work_order_processes`, migration v20) and endpoints (`/process-templates`, `/work-orders/{id}/process`). The `WorkOrder` shape and its status lifecycle are unchanged. Graphs are stored as JSON and validated server-side (allowed connections, acyclic, limits).
- **Consequences**:
  - Tenant admins edit templates and each order's structure; operators may change only per-order state and node positions (structural changes return 403).
  - Backoffice superadmins edit any organization's templates directly via `/platform/tenants/{slug}/process-templates` (configuration, not records; audited in `platform_audit_events`). Per-order graphs stay behind impersonation, like every other record.
  - A new order gets a copy of the tenant's default template. Deleting a template keeps existing order copies (`templateId` becomes `null`).
  - The graph shape is a contract-sync point: `openapi.yaml`, Go domain types and `apps/web/src/types/process.ts` change together.

---

## D-018: Iris owns warehouse stock as a movement ledger
- **Status**: `accepted` (extends [D-017](#d-017-model-work-order-processes-as-a-separate-graph-not-as-new-statuses))
- **Context**: Process graphs only mean something if the app knows what material is actually in the warehouse (magacin). Stock was not tracked anywhere in Iris; the shop keeps a partial record outside it.
- **Decision**: Iris becomes the source of truth for stock. Catalog **articles** (never services) carry stock in an append-only `stock_movements` ledger (migration v21): `opening`, `receipt`, `consumption`, `production`, `adjustment`. On-hand is the sum of movements; corrections are new movements. The opening balance is imported once (`irisctl import-stock` or the in-app stock count, "Popis"). Process item nodes link to articles via `catalogItemId`; when a step is marked done the API posts consumption for its inputs and production for its products/byproducts in the same transaction. Posting is computed as "desired net per node minus already-posted net", so undoing a step or changing an actual quantity posts only the difference.
- **Consequences**:
  - `reserved` = planned inputs of open orders not yet consumed; `available` = on-hand − reserved. The simulator and the tester compare requirements against it and flag shortages.
  - Negative stock is allowed (recording can lag the floor) but highlighted.
  - Deleting a work order or its process does not reverse movements (material was used). An article with movements cannot be deleted, only deactivated.
  - One warehouse per tenant for now. Multiple locations would add a `location_id` to movements.

---

## D-019: Processes and Magacin are per-organization modules, off by default
- **Status**: `accepted` (amends [D-017](#d-017-model-work-order-processes-as-a-separate-graph-not-as-new-statuses), [D-018](#d-018-iris-owns-warehouse-stock-as-a-movement-ledger))
- **Context**: Not every shop wants production graphs or warehouse tracking, and switching them on changes daily work (automatic stock posting). They must not appear for existing organizations without a deliberate decision.
- **Decision**: Two modules per tenant, `stock` ("Magacin") and `processes` ("Procesi rada"), where **Procesi rada requires Magacin** (flows only make sense against real stock; Magacin can run alone), stored in `app_settings` under `modules` (no migration; missing means off). Only Backoffice superadmins switch them (`PUT /platform/tenants/{slug}/modules`, audited as `tenant.modules`); tenants see them read-only in `GET /settings`. The API enforces them: disabled module routes return 403, a new order is not given the default process, and stock is neither posted nor validated. The web app hides every dependent surface and makes no requests to disabled modules.
- **Consequences**:
  - Switching Magacin off switches Procesi rada off too; the API rejects processes without stock (422). A work-order process created while Magacin was off is never stock-tracked (`work_order_processes.stock_tracked`, migration v22), so switching Magacin on never posts material for past work. Switching it off and on again resumes tracked processes, and their next save posts the difference.
  - Backoffice can prepare process templates before the module is switched on.
  - Data is kept when a module is switched off; switching it back on shows it again.

---

## D-020: Sliding organization sessions with an absolute cap, stored hashed
- **Status**: `accepted`
- **Context**: Organization sessions had a fixed 12 h lifetime that was never extended (an operator was signed out mid-shift however active they were), tokens were stored in plaintext (a copied database or backup handed out live sessions), and the login form's "Zapamti uređaj" only remembered the username.
- **Decision**: Sessions are opaque random tokens; `sessions.token_hash` keeps only their SHA-256 (as `platform_sessions` already did). Each session has an idle expiry (`expires_at`) that authenticated requests slide forward — rewritten at most once per hour per session, to spare the single SQLite writer — and an `absolute_expires_at` cap that never moves. Ordinary sign-in: 12 h idle, 24 h cap, browser-session cookie. "Zapamti me na ovom uređaju" (`remember: true`): 7 days idle, 30 days cap, persistent cookie whose expiry always equals the server-side expiry (re-sent when the session slides). Impersonation (1 h) and Backoffice (2 h) sessions keep fixed lifetimes. Migration v25 ended all existing sessions (their raw tokens can no longer be matched). A password change via `PUT /users/{id}` ends that user's sessions (impersonations included), except the admin's own current session when they change their own password. There is no signing secret: `IRIS_SESSION_SECRET` is unused and only tolerated for older deployments.
- **Consequences**:
  - An active operator stays signed in; an idle or remembered session still ends at its cap, and a stolen database is useless for signing in.
  - Sign-in failures are throttled per client IP and per organization + username (429). The client IP is taken only from `X-Real-IP`, which nginx sets (its realip module trusts `X-Forwarded-For` only from the local Caddy).
  - State-changing requests whose `Origin` is neither the API's own host nor on the CORS allow-list are refused (403), in addition to the `SameSite=Lax` cookie.

---

*Last verified against the checked-in repository state on 2026-10-17.*
