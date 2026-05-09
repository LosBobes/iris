# Iris Desktop

Desktop application for Iris, built with Electron, React, and TypeScript.

This README is scoped only to `apps/desktop`. It describes the desktop app's current architecture, local development workflow, backend API configuration, and packaging setup.

## What This App Does

The current desktop app is an admin dashboard that reaches an external Go API through Electron IPC.

Today it includes:

- an Electron main process that owns the application window and IPC handlers
- an Electron main process API client that forwards auth and work-order requests to Iris API
- a preload bridge that exposes a narrow `window.api` surface to the renderer
- a React renderer with:
  - a login screen
  - an admin-only dashboard
  - summary cards
  - date and operator filters
  - charts for monthly volume, revenue, status, and delivery methods
  - a top-clients panel
  - loading, empty, filtered-empty, and error states

Current limitations:

- the desktop app depends on a running Iris API instance configured through `IRIS_API_BASE_URL`
- the backend is still fixture-backed and keeps work-order mutations only in memory for the current process lifetime
- only one seeded user currently exists in the shared fixture data, and it has the `admin` role
- routing is limited to the existing `react-router` flow for the dashboard and work-orders screens, with sidebar navigation between those views

## Stack

- Electron `39`
- electron-vite `5`
- React `19`
- TypeScript `5.9`
- Tailwind CSS `4`
- Recharts `3`
- Vitest `4`
- electron-builder `26`

## Application Architecture

The app follows the standard Electron split between the main process, preload bridge, and renderer.

### Main Process

Location: `src/main/`

Responsibilities:

- create and configure the browser window
- register IPC handlers
- call the external Iris API for login and work-order operations
- own privileged Electron APIs that should not be exposed directly to the renderer

Current feature handlers:

- `src/main/Login/Login.async.ts`
- `src/main/WorkOrder/WorkOrder.async.ts`

The app entry point is `src/main/index.ts`.

### Preload Bridge

Location: `src/preload/`

Responsibilities:

- expose a safe API surface through `contextBridge`
- define ambient TypeScript types for `window.api`

Current API surface:

- `window.api.getBackendStatus()`
- `window.api.login(credentials)`
- `window.api.getWorkOrders()`
- `window.api.getWorkOrderOperators()`
- `window.api.getWorkOrderById(id)`
- `window.api.createWorkOrder(input)`
- `window.api.updateWorkOrder(id, changes)`
- `window.api.deleteWorkOrder(id)`

Relevant files:

- `src/preload/index.ts`
- `src/preload/index.d.ts`

### Renderer

Location: `src/renderer/src/`

Responsibilities:

- render the login form
- render the admin dashboard
- fetch data through `window.api`
- aggregate and visualize work-order data

High-level flow:

1. `App.tsx` starts in an unauthenticated state.
2. The login form calls `window.api.login(...)`.
3. On success, the authenticated user is stored in local React state.
4. If the user role is `admin`, the dashboard is rendered.
5. The dashboard hook loads work orders and operator options via IPC.
6. Aggregation utilities derive the summary and chart data used by the UI.

## Runtime Data Flow

The current data path is:

```text
IRIS_API_BASE_URL
  -> src/main/shared/runtime-config.ts
  -> src/main/shared/iris-api-client.ts
  -> IPC handlers in src/main/*
  -> preload bridge in src/preload/index.ts
  -> window.api in renderer
  -> React hooks and pages
```

## Getting Started

Run all commands from `apps/desktop`.

### Install

```bash
cd apps/desktop
npm install
```

`npm install` also runs `electron-builder install-app-deps` through `postinstall`.

### Configure the Backend URL

Create `apps/desktop/.env` with:

```env
IRIS_API_BASE_URL=http://localhost:8080
```

The Electron main process reads that value and keeps backend URLs out of the renderer.

### Start the Backend First

In a separate terminal:

```bash
cd iris-api
go run ./cmd/server
```

### Start Development Mode

```bash
npm run dev
```

This starts the Electron main process and the renderer in development mode through `electron-vite`.

### Preview a Built App

```bash
npm run build
npm run start
```

This uses `electron-vite preview` to run the built output.

## Login and Data Source

The desktop app no longer reads auth and work-order fixtures directly.
Those requests now go through Electron IPC to the external Iris API.

### Seeded Credentials

The default backend fixture data currently contains:

- username: `admin`
- password: `admin123`
- role: `admin`

There is no seeded non-admin user yet, so the access-denied branch exists in code but is not covered by the default backend fixture data.

### Work Order Shape

The current work-order API shape is:

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

Notes:

- `createdAt` and `completedAt` use ISO date strings such as `2025-02-10`
- `completedAt === null` means the work order is still in progress
- `price === null` means the order is excluded from revenue totals
- `issuedBy` is used to build the operator filter options

Today the backend still reads the shared fixture files under `apps/desktop/fixtures/`, but the desktop app consumes that data only through the API.

## Available Scripts

### Formatting and Linting

```bash
npm run format
npm run lint
```

### Tests

```bash
npm run test
npm run test:watch
```

### Type Checking

```bash
npm run typecheck:node
npm run typecheck:web
npm run typecheck
```

`typecheck` runs both the Electron-side and renderer-side TypeScript projects.

### Build

```bash
npm run build
npm run build:unpack
npm run build:win
npm run build:mac
npm run build:linux
```

Script behavior:

- `build` runs type checking and then builds with `electron-vite`
- `build:unpack` creates an unpacked app directory
- `build:win` runs `build` first, then packages Windows artifacts
- `build:mac` packages macOS artifacts
- `build:linux` packages Linux artifacts

If you want the same typecheck preflight before `build:mac` or `build:linux`, run `npm run typecheck` manually first.

## Packaging Notes

Packaging is configured in `electron-builder.yml`.

Current notable settings:

- `appId`: `com.electron.app`
- `productName`: `desktop`
- build resources live under `build/`
- Linux targets: `AppImage`, `snap`, `deb`
- macOS uses `build/entitlements.mac.plist`
- published update URL is still the placeholder `https://example.com/auto-updates`

Because the publish URL is a placeholder, auto-update behavior should be treated as incomplete until real release infrastructure is configured.

## Directory Map

This is the current layout of the desktop app:

```text
apps/desktop/
├── build/                    # electron-builder resources and platform assets
├── config/                   # environment-specific config stubs
├── fixtures/                 # local JSON fixture data for auth and dashboard data
├── model/                    # shared domain types used by main and renderer
├── out/                      # generated Electron build output; do not edit by hand
├── resources/                # app resources loaded by Electron
├── src/
│   ├── main/                 # Electron main process
│   │   ├── Login/            # auth IPC handlers
│   │   ├── WorkOrder/        # work-order IPC handlers
│   │   └── shared/           # fixture-loading helper
│   ├── preload/              # contextBridge API exposed to the renderer
│   └── renderer/
│       ├── index.html        # renderer HTML entry
│       └── src/
│           ├── assets/       # Tailwind entry and base CSS
│           ├── components/   # login, dashboard, layout, and UI components
│           ├── hooks/        # renderer data hooks
│           ├── lib/          # utilities and dashboard aggregation logic
│           ├── pages/        # page-level renderer components
│           ├── test/         # test setup
│           ├── types/        # renderer-facing domain contracts
│           ├── App.tsx       # auth gate and top-level renderer app
│           └── main.tsx      # React bootstrap
├── electron-builder.yml      # packaging config
├── electron.vite.config.ts   # Electron + Vite config
├── package.json
├── tsconfig.node.json
├── tsconfig.web.json
└── vitest.config.ts
```

## Key Files

If you are modifying the app, these are the main files to understand first:

- `src/main/index.ts`: Electron app bootstrap and IPC registration
- `src/main/Login/Login.async.ts`: fixture-backed login handler
- `src/main/WorkOrder/WorkOrder.async.ts`: work-order data handlers
- `src/main/shared/load-fixture.ts`: shared fixture loader
- `src/preload/index.ts`: renderer API bridge
- `src/preload/index.d.ts`: ambient window and IPC type declarations
- `src/renderer/src/App.tsx`: login gate and admin access check
- `src/renderer/src/hooks/useDashboardData.ts`: fetch + aggregation orchestration
- `src/renderer/src/lib/dashboard/aggregations.ts`: pure dashboard aggregation functions
- `src/renderer/src/pages/DashboardPage.tsx`: page composition and dashboard states
- `src/renderer/src/components/layout/AppShell.tsx`: desktop shell layout

## Renderer Conventions

### Import Aliases

The renderer uses these aliases, configured in `electron.vite.config.ts` and `vitest.config.ts`:

- `@` -> `src/renderer/src`
- `@renderer` -> `src/renderer/src`

### UI Language

Visible UI text is currently Serbian, while code identifiers and file names remain in English.

### Styling

The renderer uses:

- Tailwind CSS v4
- shared utility classes from `src/renderer/src/assets/`
- shadcn-style component patterns for reusable UI pieces

## Testing

Tests run with Vitest in a `jsdom` environment.

Current testing setup:

- config: `vitest.config.ts`
- setup file: `src/renderer/src/test/setup.ts`
- test location: `src/renderer/src/**/*.test.{ts,tsx}` and `src/renderer/src/**/*.spec.{ts,tsx}`

Examples already in the app:

- `src/renderer/src/App.test.tsx`
- `src/renderer/src/components/Login/Login.test.tsx`
- `src/renderer/src/lib/dashboard/aggregations.test.ts`

## Development Workflow

Typical local workflow:

1. `cd apps/desktop`
2. `npm install`
3. `npm run dev`
4. sign in with `admin` / `admin123`
5. edit renderer code, IPC handlers, or fixtures as needed
6. run `npm run test`
7. run `npm run typecheck`
8. run `npm run lint`

For dashboard-related UI work, fixture edits are usually the fastest way to verify new states.

## Known Gaps

The current desktop app is intentionally narrow in scope.

Known gaps include:

- no production authentication integration
- no persistent work-order storage
- no route-based navigation yet
- no seeded non-admin fixture user
- no real auto-update endpoint

Those constraints are useful to keep in mind before adding new features or assuming production readiness.
