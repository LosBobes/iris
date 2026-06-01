# Architecture Overview

Iris contains three runtime surfaces for Stamparija Cobanovic operations: the
Electron desktop client, the browser web client, and the shared Go API.

## System Topology

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Iris Desktop Client (Electron)                                      │
│                                                                     │
│ React renderer -> window.api preload bridge -> main IPC handlers    │
│                                                -> IrisApiClient      │
└───────────────────────────────────────────────────────────┬─────────┘
                                                            │
                                                            │ HTTP/JSON
                                                            │
┌───────────────────────────────────────────────────────────┴─────────┐
│ Iris Web Client (Vite)                                               │
│                                                                      │
│ React app -> window.api -> HTTP client or in-browser fixture adapter │
└───────────────────────────────────────────────────────────┬─────────┘
                                                            │
                                                            │ HTTP/JSON
                                                            │
┌───────────────────────────────────────────────────────────▼─────────┐
│ Iris Shared Backend (Go API)                                         │
│                                                                      │
│ chi router -> handlers -> store.Store -> SQLite or fixture store     │
└─────────────────────────────────────────────────────────────────────┘
```

## Workspace Components

### Shared Go Backend (`iris-api/`)

- Serves authentication, customers, locations, work orders, reporting, and
  public tracking.
- Defines the HTTP contract in `iris-api/openapi.yaml`.
- Registers handlers and auth middleware in `iris-api/internal/api/server.go`.
- Uses `store.Store` as the persistence boundary. Runtime SQLite is selected by
  `IRIS_DB_PATH`; fixture data under `iris-api/testdata/fixtures` remains for
  tests and local fallback mode.
- Provides `cmd/irisctl` for migrations, demo seeding, CSV import, user
  creation, and database backup.

### Electron Desktop Client (`apps/desktop/`)

- Runs the operational UI on local shop machines.
- Keeps the renderer isolated behind the preload `window.api` bridge.
- Sends renderer requests to Electron main-process IPC handlers.
- Uses a typed `IrisApiClient` in the main process to communicate with
  `iris-api`.
- Resolves API configuration through `apps/desktop/src/main/shared/runtime-config.ts`.

### Web Client (`apps/web/`)

- Provides browser operations, dashboard reporting, customer management, and
  public work-order tracking.
- Uses `apps/web/src/lib/web-api.ts` as the runtime adapter boundary.
- Runs in `http` mode against `iris-api` or `fixtures` mode against a stateful
  in-browser store.
- Uses browser routes for authenticated pages and `/public/work-orders/:token`.

## Shared Domain Model

Work-order contracts are mirrored across:

- `apps/web/src/types/work-order.ts`
- `apps/desktop/model/work-order.ts`
- `iris-api/internal/domain/types.go`
- `iris-api/openapi.yaml`

Canonical work-order statuses:

1. `new`
2. `assigned`
3. `inProgress`
4. `waitingForCustomer`
5. `waitingForMaterials`
6. `completed`
7. `cancelled`
8. `invoiced`

The Go API still accepts legacy `draft` and `active` inputs where fixture
normalization requires backward compatibility.

## Request Flows

Authenticated desktop flow:

```text
React renderer
  -> window.api
  -> Electron preload
  -> Electron main IPC handler
  -> IrisApiClient
  -> iris-api HTTP endpoint
  -> store.Store
```

Web boot flow:

```text
Vite app
  -> VITE_IRIS_API_MODE
  -> createHttpApi(baseUrl) or fixture adapter
  -> window.api
  -> pages and hooks
```

## Verification Boundaries

- `iris-api/`: `go test ./...`
- `apps/web/`: `npm run lint`, `npm run build`, `npm test`
- `apps/desktop/`: `npm run lint`, `npm run typecheck`, `npm test`
- Contract changes require synchronized updates to OpenAPI, Go domain types,
  TypeScript types, fixtures, and API/client tests.

*Last verified against the checked-in repository state on 2026-06-01.*
