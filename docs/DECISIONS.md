# Decisions

This file records project-level decisions that are visible in the repository today.

Status values used here:

- `accepted`: active decision
- `temporary`: active for now, expected to change later

## D-001: Build the current product as an Electron desktop app

- Status: `accepted`

### Context

The repository's active application is a desktop client for Stamparija Cobanovic, implemented in `apps/desktop/`.

### Decision

Use Electron for the desktop shell, React for the UI, and TypeScript across the application codebase.

### Consequences

- The app can use desktop packaging and Electron runtime capabilities.
- The project must preserve clear trust boundaries between renderer, preload, and main process code.
- Testing and local development need both web-style and Electron-aware workflows.

## D-002: Keep a three-layer Electron split

- Status: `accepted`

### Context

Electron apps mix privileged and unprivileged runtime concerns. The repo already separates them physically.

### Decision

Keep the application split into:

- `src/main/`
- `src/preload/`
- `src/renderer/src/`

### Consequences

- Privileged logic stays out of the renderer.
- New features need explicit wiring across layers instead of shortcut imports.
- The preload layer becomes a deliberate contract surface that must stay small and typed.

## D-003: Use typed IPC through `window.api`

- Status: `accepted`

### Context

Renderer code needs to request data and actions from the Electron main process without importing Node APIs directly.

### Decision

Expose app-specific methods on `window.api` in preload and forward them with `ipcRenderer.invoke(...)` to named `ipcMain.handle(...)` channels in the main process.

### Consequences

- IPC becomes the standard integration path for renderer-to-main communication.
- Every new method must be added in three places:
  - main handler
  - preload runtime bridge
  - preload type declarations
- The project keeps a single, understandable path for privileged calls.

## D-004: Organize code by feature, not by file type

- Status: `accepted`

### Context

The repo includes explicit guidance to keep components, handlers, and related files grouped by concern.

### Decision

Prefer feature-oriented folders and colocated tests over role-based dumping grounds.

### Consequences

- It is easier to find all files related to a feature.
- Large features can grow vertically without scattering code across the repo.
- Shared cross-feature types still live in `apps/desktop/model/`.

## D-005: Use fixture JSON files as the current data source

- Status: `temporary`

### Context

The current desktop app needs local development data for login and dashboard reporting, but there is no checked-in backend module in this repository state.

### Decision

Load users and work orders from:

- `apps/desktop/fixtures/users.json`
- `apps/desktop/fixtures/work-orders.json`

through main-process handlers.

### Consequences

- Local development is simple and deterministic.
- The current app shape is good for UI iteration and tests.
- Authentication and authorization are not production-ready.
- A future backend integration will need to replace fixture loading without leaking backend concerns into renderer code.

## D-006: Keep access control simple in the current UI slice

- Status: `temporary`

### Context

The app currently needs a minimal distinction between admin and non-admin users so the dashboard is not shown to every authenticated account.

### Decision

Store the authenticated user in `App.tsx` and render the admin dashboard only when `currentUser.role === 'admin'`.

### Consequences

- The current dashboard flow remains simple.
- The renderer owns session state for now.
- This is a product/UI decision, not a strong security boundary.
- If a stronger auth model is added later, main-process or backend enforcement must take over.

## D-007: Compute dashboard reporting in the renderer

- Status: `accepted`

### Context

The dashboard needs filtered summaries, chart series, and top-client rankings derived from the same underlying work-order set.

### Decision

Fetch raw work orders once, then derive summary and chart data in renderer-side pure functions under `src/renderer/src/lib/dashboard/aggregations.ts`.

### Consequences

- Aggregation logic stays easy to unit test.
- Dashboard widgets share one filtering and aggregation pipeline.
- If datasets become much larger later, aggregation placement may need to be revisited.

## D-008: Keep UI copy in Serbian and code in English

- Status: `accepted`

### Context

The application serves Serbian-speaking users, while the codebase is maintained by developers using English technical identifiers.

### Decision

Use Serbian for visible UI text and English for code identifiers, filenames, and comments.

### Consequences

- The product stays aligned with its user base.
- Domain terminology needs explicit mapping between Serbian labels and English code values.
- Documentation such as `docs/DOMAIN_GLOSSARY.md` must stay updated when either side changes.

## D-009: Allow renderer-specific domain contracts when needed

- Status: `accepted`

### Context

The shared model layer contains the cross-process record shape, while the renderer also needs dashboard-specific helper contracts such as filters and summaries.

### Decision

Keep shared core models in `apps/desktop/model/`, but allow richer renderer-only contracts in `apps/desktop/src/renderer/src/types/`.

### Consequences

- Renderer code can evolve view-specific contracts without overloading the shared model layer.
- Contributors must keep overlapping shapes aligned when changing work-order fields.
- Documentation should call out the difference so drift does not go unnoticed.
