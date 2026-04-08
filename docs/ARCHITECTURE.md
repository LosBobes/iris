# Architecture Overview

This document describes the architecture that exists in the repository today.

## System Overview

Iris is currently an Electron desktop application for Stamparija Cobanovic.

The checked-in application lives in `apps/desktop/` and is built with:

- Electron
- React
- TypeScript
- electron-vite
- Tailwind CSS v4
- Recharts
- Vitest

The root `README.md` also references an `iris-api` backend module, but that module is not present in this checkout. The architecture below therefore describes the desktop app that is actually checked in.

## High-Level Structure

```text
┌──────────────────────────────────────────────────────────────┐
│                    Iris Desktop (Electron)                  │
├──────────────────────────────────────────────────────────────┤
│  Renderer (React UI)                                        │
│  ├─ Login screen                                             │
│  ├─ Access denied state                                      │
│  └─ Admin dashboard                                          │
│     ├─ Summary cards                                         │
│     ├─ Date/operator filters                                 │
│     ├─ Monthly order and revenue charts                      │
│     ├─ Status and delivery charts                            │
│     └─ Top clients panel                                     │
├──────────────────────────────────────────────────────────────┤
│  Preload Bridge                                              │
│  └─ Typed window.api IPC surface                             │
├──────────────────────────────────────────────────────────────┤
│  Main Process                                                │
│  ├─ BrowserWindow lifecycle                                  │
│  ├─ Login IPC handlers                                       │
│  └─ Work-order IPC handlers                                  │
├──────────────────────────────────────────────────────────────┤
│  Local Data Sources                                          │
│  ├─ fixtures/users.json                                      │
│  └─ fixtures/work-orders.json                                │
└──────────────────────────────────────────────────────────────┘
```

## Workspace Layout

```text
.
├─ apps/
│  └─ desktop/
│     ├─ build/                 Packaging assets
│     ├─ config/                Development and production config files
│     ├─ fixtures/              Local JSON data for login and dashboard reporting
│     ├─ model/                 Shared cross-layer domain types
│     ├─ resources/             App icon assets
│     ├─ src/
│     │  ├─ main/               Electron main process
│     │  ├─ preload/            Context bridge and ambient typings
│     │  └─ renderer/src/       React UI
│     ├─ electron.vite.config.ts
│     ├─ vitest.config.ts
│     └─ package.json
└─ docs/
   ├─ ARCHITECTURE.md
   ├─ CONTRIBUTING.md
   ├─ DECISIONS.md
   ├─ DOMAIN_GLOSSARY.md
   └─ PROJECT_CONTEXT.md
```

## Runtime Layers

### 1. Electron Main Process

Location: `apps/desktop/src/main/`

Responsibilities:

- create and configure the `BrowserWindow`
- register IPC handlers during startup
- own privileged Electron and Node access
- load fixture data through the shared file loader
- keep renderer code isolated from direct filesystem access

Key files:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/Login/Login.async.ts`
- `apps/desktop/src/main/WorkOrder/WorkOrder.async.ts`
- `apps/desktop/src/main/shared/load-fixture.ts`

Important current details:

- window size is initialized at `1430x800` with minimum `1024x700`
- the preload script is loaded from `../preload/index.js`
- external links are opened with `shell.openExternal(...)`
- the app appends `lang=sr-Latn` on startup for Serbian Latin locale handling
- Electron sandboxing is currently disabled in `BrowserWindow.webPreferences`

### 2. Preload Bridge

Location: `apps/desktop/src/preload/`

Responsibilities:

- expose a narrow, typed API to the renderer
- forward renderer calls to `ipcRenderer.invoke(...)`
- define ambient TypeScript declarations for `window.api`
- expose `window.electron` from `@electron-toolkit/preload`

Current `window.api` surface:

- `login(credentials)`
- `getWorkOrders()`
- `getWorkOrderOperators()`

Key files:

- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/index.d.ts`

### 3. Renderer

Location: `apps/desktop/src/renderer/src/`

Responsibilities:

- render the login flow
- store the current authenticated user in local React state
- gate dashboard access based on `role === 'admin'`
- fetch work-order data via `window.api`
- derive summary and chart data from raw work orders
- render loading, empty, filtered-empty, and error states

Key files:

- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/pages/DashboardPage.tsx`
- `apps/desktop/src/renderer/src/hooks/useDashboardData.ts`
- `apps/desktop/src/renderer/src/lib/dashboard/aggregations.ts`
- `apps/desktop/src/renderer/src/components/Login/Login.tsx`

### 4. Shared Domain Model Layer

Location: `apps/desktop/model/`

Responsibilities:

- define shared types used across process boundaries
- keep main-process handlers and renderer expectations aligned

Current shared models:

- `apps/desktop/model/user.ts`
- `apps/desktop/model/work-order.ts`

Note:

- the renderer also defines `apps/desktop/src/renderer/src/types/work-order.ts` for UI-specific types such as `DashboardFilters`, `DashboardSummary`, and `WorkOrderRepository`

## Feature Areas

### Authentication

Current implementation:

- login form in `apps/desktop/src/renderer/src/components/Login/Login.tsx`
- IPC handler in `apps/desktop/src/main/Login/Login.async.ts`
- data source `apps/desktop/fixtures/users.json`

Behavior:

- renderer submits username and password via `window.api.login(...)`
- main process validates against fixture users
- password is never returned to the renderer
- successful login returns a minimal authenticated user shape
- failed login returns a Serbian error message

Current limitation:

- auth is local, fixture-backed, and not a durable security boundary

### Dashboard Reporting

Current implementation:

- dashboard page in `apps/desktop/src/renderer/src/pages/DashboardPage.tsx`
- data hook in `apps/desktop/src/renderer/src/hooks/useDashboardData.ts`
- pure aggregation helpers in `apps/desktop/src/renderer/src/lib/dashboard/aggregations.ts`
- chart components under `apps/desktop/src/renderer/src/components/dashboard/charts/`

Displayed widgets:

- summary cards
- work orders per month
- revenue per month
- status distribution
- delivery method distribution
- top clients

Filters:

- `dateFrom`
- `dateTo`
- `issuedBy`

### Fixture Loading

Current implementation:

- `apps/desktop/src/main/shared/load-fixture.ts`

Resolution order:

1. `app.getAppPath()/fixtures/<file>`
2. `process.cwd()/fixtures/<file>`

Current fixture files:

- `apps/desktop/fixtures/users.json`
- `apps/desktop/fixtures/work-orders.json`

## Request And Data Flow

### Login Flow

```text
1. Renderer shows Login component
2. User submits credentials
3. Renderer -> window.api.login(credentials)
4. Preload -> ipcRenderer.invoke('auth:login', credentials)
5. Main process loads fixtures/users.json
6. Main process returns LoginResponse
7. App.tsx stores AuthenticatedUser in local state
8. Renderer shows dashboard for admin, access-denied view otherwise
```

### Dashboard Flow

```text
1. DashboardPage mounts
2. useDashboardData() requests:
   - window.api.getWorkOrders()
   - window.api.getWorkOrderOperators()
3. Preload forwards:
   - workorders:getAll
   - workorders:getOperators
4. Main process loads fixtures/work-orders.json
5. Renderer filters and aggregates records
6. Dashboard components render charts and summary cards
```

### IPC Pattern

The project uses a consistent invoke/handle convention:

- renderer: `window.api.<method>()`
- preload: `ipcRenderer.invoke(channel, payload)`
- main: `ipcMain.handle(channel, handler)`

Current channels:

- `auth:login`
- `workorders:getAll`
- `workorders:getOperators`
- `workorders:getById`
- `workorders:create`
- `workorders:update`
- `workorders:delete`

## Source Of Truth By Concern

| Concern | Current source of truth |
| --- | --- |
| Authenticated user shape | `apps/desktop/model/user.ts` |
| Shared work-order shape | `apps/desktop/model/work-order.ts` |
| Renderer-specific work-order contracts | `apps/desktop/src/renderer/src/types/work-order.ts` |
| Login fixture data | `apps/desktop/fixtures/users.json` |
| Work-order fixture data | `apps/desktop/fixtures/work-orders.json` |
| Dashboard aggregation rules | `apps/desktop/src/renderer/src/lib/dashboard/aggregations.ts` |
| Serbian labels for enums | `apps/desktop/src/renderer/src/shared/utils/work-orders.ts` |

## Key Types

### User

Defined in `apps/desktop/model/user.ts`

```ts
interface User {
  id: string
  username: string
  role: 'admin' | 'user'
}
```

### WorkOrder

Defined in `apps/desktop/model/work-order.ts`

```ts
interface WorkOrder {
  id: string
  orderNumber: string
  clientName: string
  contactPerson: string | null
  jobDescription: string
  jobDetails: JobDetails | null
  billingDocumentType: 'invoice' | 'cashCollection' | 'proforma' | null
  billingDocumentNumber: string | null
  shipping: Shipping
  issuedBy: string
  executedBy: string | null
  issueDate: string
  dueDate: string | null
  isCompleted: boolean
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  price: number | null
  note: string | null
  createdAt: string
  updatedAt: string
  completionDate: string | null
}
```

### Renderer-Only Types

Defined in `apps/desktop/src/renderer/src/types/work-order.ts`

- `DashboardFilters`
- `DashboardSummary`
- `WorkOrderRepository`

## Key Architectural Decisions Visible In Code

### 1. Desktop-First Electron Application

- the active product surface in this checkout is a desktop app
- Electron owns the shell, window lifecycle, and privileged APIs

### 2. Three-Layer Electron Split

- main process, preload, and renderer are physically separated
- new privileged capabilities should follow the same boundary

### 3. Typed IPC Through `window.api`

- renderer code reaches privileged behavior through preload
- each new capability must be wired across main, preload runtime, and preload typings

### 4. Fixture-Backed Data For Current Development

- login and work orders are read from local JSON fixtures
- this keeps development deterministic, but it is temporary architecture

### 5. Renderer-Side Reporting Aggregations

- dashboard summaries and chart series are computed in pure renderer helpers
- this keeps reporting logic testable and local to the UI slice

## Testing And Verification Surface

Current test setup:

- Vitest with jsdom
- React Testing Library
- test setup in `apps/desktop/src/renderer/src/test/setup.ts`

Current checked-in tests:

- `apps/desktop/src/renderer/src/App.test.tsx`
- `apps/desktop/src/renderer/src/components/Login/Login.test.tsx`
- `apps/desktop/src/renderer/src/lib/dashboard/aggregations.test.ts`

## Packaging And Tooling

- build and dev orchestration: `apps/desktop/electron.vite.config.ts`
- Electron packaging: `apps/desktop/electron-builder.yml`
- renderer alias: `@` -> `apps/desktop/src/renderer/src`
- test config: `apps/desktop/vitest.config.ts`
- UI registry config: `apps/desktop/components.json`

## Current Constraints And Gaps

- the `iris-api` module mentioned in the root README is not present in this checkout
- data is fixture-backed, not database-backed
- there is no persistent auth session
- authorization is a renderer-side role gate, not a strong security boundary
- work-order modeling exists in both shared and renderer-specific type files
- preload exposes `window.electron` in addition to the narrower `window.api`
- there is no checked-in `apps/desktop/desktop-threat-model.md`, despite an earlier docs reference

## Where To Extend The System Safely

- add new privileged operations in `apps/desktop/src/main/`
- expose them through the typed preload API in `apps/desktop/src/preload/`
- consume them from hooks or pages in `apps/desktop/src/renderer/src/`
- keep reporting logic in pure helpers when it does not need privileged access
- update both work-order type definitions if the work-order schema changes
- update `docs/DECISIONS.md` and `docs/DOMAIN_GLOSSARY.md` when architecture or terminology shifts

*Last verified against the checked-in repository state on 2026-04-07.*
