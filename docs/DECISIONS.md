# Architectural Decisions

This document records the project-level architectural decisions (ADRs) that shape the Iris workspace.

## Status Definitions
- `accepted`: Active architectural decision.
- `temporary`: Active for now, expected to evolve.
- `superseded`: Replaced by a more recent decision.

---

## D-001: Build the primary desktop product as an Electron application
- **Status**: `accepted`
- **Context**: The local print shop (Stamparija Cobanovic) operates on-premise physical terminals that require local application reliability and easy operating system integration.
- **Decision**: Wrap the React user interface in an Electron shell (`apps/desktop`), utilizing a multi-process architecture for native operations.
- **Consequences**:
  - The application benefits from native OS window management and desktop packaging.
  - Development requires distinct workflows for privileged main-process concerns and unprivileged renderer interfaces.

---

## D-002: Maintain a strict three-layer Electron split
- **Status**: `accepted`
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
- **Status**: `accepted`
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
  - Not a hard cryptographic boundary. API hardening and signed cookie-based route guards are designated for Phase 2 implementation.

---

## D-007: Perform analytical dashboard aggregates in the renderer
- **Status**: `accepted`
- **Context**: Top client lists, monthly revenue buckets, and order status counts are computed from the same raw work-order dataset.
- **Decision**: Fetch raw work-orders, then perform functional aggregations inside renderer-side pure functions (`apps/web/src/lib/dashboard/` and `apps/desktop/src/renderer/src/lib/dashboard/`).
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
- **Decision**: Establish `iris-api` using Go, routing calls via Chi routers, and executing transactions against contract routes declared in `openapi.yaml`. During startup, the Go store seeds itself from the desktop JSON fixtures to maintain stateless testing.
- **Consequences**:
  - Centralizes validation and business rules.
  - Establishes a seamless upgrade path for database persistence (SQLite/PostgreSQL) in Phase 2.

---

## D-011: Desktop connection via IPC-HTTP client forwarding
- **Status**: `accepted`
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

## D-013: Standardize on an expanded 9-status domain model
- **Status**: `accepted`
- **Context**: Real-world operations need detailed steps beyond basic open/closed statuses—specifically tracking scheduling, materials, client approvals, and invoicing drafts.
- **Decision**: Standardize all monorepo type contracts on a unified 9-status print-shop lifecycle (`new`, `assigned`, `inProgress`, `waitingForCustomer`, `waitingForMaterials`, `completed`, `cancelled`, `invoiced`) complete with normalized `Customer`, `Location`, `Assignment`, `InvoiceDraft`, and execution metrics.
- **Consequences**:
  - Requires synchronized updates to TypeScript types, Go structs, and OpenAPI definitions when changing schemas.
  - Guarantees rich, operation-grounded dashboard analytics.

---

*Last verified against the checked-in repository state on 2026-05-31.*
