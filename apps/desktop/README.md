# Iris Desktop

Electron desktop client for local Iris shop operations.

## Runtime Scope

- Electron main process owns windows, IPC handlers, and privileged APIs.
- Preload exposes the typed `window.api` bridge.
- React renderer handles login, navigation, dashboards, and work-order screens.
- Main-process handlers call the shared Go API through `IrisApiClient`.

Current limitations:

- The desktop app requires a running `iris-api` instance configured through
  `IRIS_API_BASE_URL`.
- Access control is enforced by the API session and by renderer-side navigation
  gates.
- Packaging metadata still contains placeholder release/update settings.

## Stack

- Electron 39
- electron-vite 5
- React 19
- TypeScript 5.9
- Tailwind CSS 4
- Recharts 3
- Vitest 4
- electron-builder 26

## Application Boundaries

Main process:

- `src/main/index.ts`
- `src/main/Login/Login.async.ts`
- `src/main/WorkOrder/WorkOrder.async.ts`
- `src/main/shared/iris-api-client.ts`
- `src/main/shared/runtime-config.ts`

Preload bridge:

- `src/preload/index.ts`
- `src/preload/index.d.ts`

Renderer:

- `src/renderer/src/App.tsx`
- `src/renderer/src/components/`
- `src/renderer/src/hooks/`
- `src/renderer/src/pages/`
- `src/renderer/src/lib/dashboard/`

## Runtime Data Flow

```text
IRIS_API_BASE_URL
  -> src/main/shared/runtime-config.ts
  -> src/main/shared/iris-api-client.ts
  -> main-process IPC handlers
  -> preload bridge
  -> window.api
  -> React pages and hooks
```

## Local Commands

Create `apps/desktop/.env`:

```env
IRIS_API_BASE_URL=http://localhost:8080
```

Run the backend from `iris-api/`:

```bash
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl migrate
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
IRIS_DB_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
```

Run the desktop app from `apps/desktop/`:

```bash
npm install
npm run dev
```

Preview built output:

```bash
npm run build
npm run start
```

## API Surface Used By The Renderer

- `window.api.getBackendStatus()`
- `window.api.login(credentials)`
- `window.api.getWorkOrders()`
- `window.api.getWorkOrderOperators()`
- `window.api.getWorkOrderById(id)`
- `window.api.createWorkOrder(input)`
- `window.api.updateWorkOrder(id, changes)`
- `window.api.deleteWorkOrder(id)`

## Verification

```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

## Packaging Notes

Packaging is configured in `electron-builder.yml`.

- `appId`: `com.electron.app`
- `productName`: `desktop`
- build resources: `build/`
- Linux targets: `AppImage`, `snap`, `deb`
- macOS entitlements: `build/entitlements.mac.plist`
- published update URL: `https://example.com/auto-updates`

Treat auto-update behavior as incomplete until release infrastructure is
configured.
