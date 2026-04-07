# Iris Project Context

This document provides a fast, code-grounded summary of the Iris repository for quick context loading.

## Project Overview

**Iris** is currently an Electron desktop application for Stamparija Cobanovic.

| Aspect | Value |
| --- | --- |
| Active app | `apps/desktop` |
| Desktop shell | Electron 39 |
| UI | React 19 |
| Language | TypeScript 5.9 |
| Build tool | electron-vite 5 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3 |
| Test framework | Vitest 4 + React Testing Library |
| Packaging | electron-builder 26 |

Important repository note:

- the root `README.md` mentions an `iris-api` module, but that directory is not present in this checkout

## What Exists Today

The current desktop app supports:

- fixture-backed login
- admin-only dashboard access
- work-order reporting
- date and operator filtering
- monthly orders and revenue charts
- status and delivery-method charts
- top-clients reporting

The current desktop app does not include:

- a checked-in backend service
- persistent authentication
- a router
- database-backed storage

## Repository Structure

```text
.
├─ apps/
│  └─ desktop/
│     ├─ fixtures/              JSON fixture data
│     ├─ model/                 Shared cross-process types
│     ├─ src/
│     │  ├─ main/               Electron main process
│     │  ├─ preload/            Typed renderer bridge
│     │  └─ renderer/src/       React UI
│     ├─ build/                 Packaging assets
│     ├─ config/                App config files
│     ├─ electron.vite.config.ts
│     ├─ electron-builder.yml
│     ├─ vitest.config.ts
│     └─ package.json
└─ docs/
   ├─ ARCHITECTURE.md
   ├─ CONTRIBUTING.md
   ├─ DECISIONS.md
   ├─ DOMAIN_GLOSSARY.md
   └─ PROJECT_CONTEXT.md
```

## Main Process

Location: `apps/desktop/src/main/`

Key files:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/Login/Login.async.ts`
- `apps/desktop/src/main/WorkOrder/WorkOrder.async.ts`
- `apps/desktop/src/main/shared/load-fixture.ts`

Responsibilities:

- create the Electron window
- register IPC handlers
- load fixture data
- keep filesystem and Electron privileges out of the renderer

Current IPC handlers:

- `auth:login`
- `workorders:getAll`
- `workorders:getOperators`

## Preload Layer

Location: `apps/desktop/src/preload/`

Key files:

- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/index.d.ts`

Current renderer API:

```ts
window.api.login(credentials)
window.api.getWorkOrders()
window.api.getWorkOrderOperators()
```

The preload also exposes `window.electron` from `@electron-toolkit/preload`.

## Renderer

Location: `apps/desktop/src/renderer/src/`

Key entry points:

- `apps/desktop/src/renderer/src/main.tsx`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/pages/DashboardPage.tsx`

Main UI areas:

- `components/Login/` for the login form
- `components/dashboard/` for dashboard widgets and charts
- `components/layout/` for the app shell
- `hooks/` for data-fetching and filter state
- `lib/dashboard/` for pure aggregation and label helpers
- `types/` for renderer-specific domain contracts

Current renderer flow:

1. `App.tsx` starts unauthenticated.
2. `Login.tsx` submits credentials through `window.api.login(...)`.
3. On success, `App.tsx` stores `AuthenticatedUser` in local state.
4. Only `role === 'admin'` reaches `DashboardPage`.
5. `useDashboardData()` loads work orders and operators through IPC.
6. Renderer aggregation helpers derive summary and chart data.

## Domain Model

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
  clientName: string
  documentType: 'invoice' | 'receipt' | 'contract' | 'certificate'
  deliveryMethod: 'email' | 'pickup' | 'courier' | 'fax'
  issuedBy: string
  createdAt: string
  completedAt: string | null
  price: number | null
}
```

### Renderer-Specific Types

Defined in `apps/desktop/src/renderer/src/types/work-order.ts`

- `DashboardFilters`
- `DashboardSummary`
- `WorkOrderRepository`

## Fixture Data

Current fixture files:

- `apps/desktop/fixtures/users.json`
- `apps/desktop/fixtures/work-orders.json`

Current auth seed:

- username: `admin`
- password: `admin123`
- role: `admin`

Fixture loading order:

1. `app.getAppPath()/fixtures/<file>`
2. `process.cwd()/fixtures/<file>`

## Reporting Logic

The dashboard uses pure aggregation helpers in `apps/desktop/src/renderer/src/lib/dashboard/aggregations.ts`.

Main derived outputs:

- filtered work orders
- summary totals
- monthly order buckets
- monthly revenue buckets
- delivery-method distribution
- top clients

Enum-to-label mapping lives in:

- `apps/desktop/src/renderer/src/lib/dashboard/labels.ts`

## Current Tests

Checked-in test files:

- `apps/desktop/src/renderer/src/App.test.tsx`
- `apps/desktop/src/renderer/src/components/Login/Login.test.tsx`
- `apps/desktop/src/renderer/src/lib/dashboard/aggregations.test.ts`

Test setup:

- jsdom environment
- React Testing Library
- global API stubbing with `vi.stubGlobal('api', ...)`

## Commands

Run commands from `apps/desktop`.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

## Important Constraints

- the current app is desktop-only in this checkout
- the root README is ahead of the checked-in repo state because `iris-api` is absent
- renderer auth gating is a UI rule, not a strong security boundary
- fixture data is temporary architecture
- work-order types exist in both `model/` and renderer `types/` and must stay aligned
- there is no checked-in `apps/desktop/desktop-threat-model.md`

## Docs Map

- `docs/ARCHITECTURE.md`: system structure and runtime flow
- `docs/DECISIONS.md`: architectural and product decisions visible in code
- `docs/DOMAIN_GLOSSARY.md`: Serbian business terms and code mappings
- `docs/CONTRIBUTING.md`: contributor workflow and guardrails

*Last verified against the checked-in repository state on 2026-04-07.*
