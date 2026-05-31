# Architecture Overview

This document describes the high-level architecture of the Iris workspace, covering the Electron desktop app, the web client, the Go HTTP API, and their data relationships.

## System Topology

Iris is a multi-service workspace catering to Stamparija Cobanovic. It contains three main components: a desktop operational client, a web interface, and a shared Go backend.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Iris Desktop Client (Electron)                  │
│                                                                        │
│   Renderer (React UI)  ──[window.api IPC]──>  Main Process             │
│                                                     │                  │
│                                              [IrisApiClient]           │
└───────────────────────────────────────────────────────────────────┼────┘
                                                                    │
┌───────────────────────────────────────────────────────────────────┼────┐
│                        Iris Web Client (Vite)                     │
│                                                                    │
│   Renderer (React UI)  ──[VITE_IRIS_API_MODE]───┬──> [createHttpApi] ──┼────┐
│                                                 │                      │    │
│                                                 └──> [Fixture Store]   │    │
└────────────────────────────────────────────────────────────────────────┘    │
                                                                              │
                                                                     [HTTP / JSON]
                                                                              │
                                                                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Iris Shared Backend (Go API)                    │
│                                                                        │
│   [Chi HTTP Router]  ──>  [API Handlers]  ──>  [Fixture Memory Store]  │
│                                                           │            │
│                                                      (Loaded from      │
│                                                       fixtures)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Workspace Components

### 1. Shared Go Backend (`iris-api/`)

- **Role**: Serves as the central server and database layer, handling authentication, order processing, and customer metadata.
- **Contract-First API**: The endpoints are defined in `iris-api/openapi.yaml`. The handler logic is registered in `iris-api/internal/api/server.go`.
- **Stateless Fixture Store**: `iris-api/internal/store/` provides thread-safe data operations. During server boot, it loads fixtures directly from `apps/desktop/fixtures/`, making development fully deterministic and independent of heavy local databases.
- **Key Modules**:
  - `cmd/server/`: The entry point that boots the HTTP server on port `8080` (or `IRIS_API_ADDR`).
  - `internal/api/`: Maps endpoints, decodes JSON payloads, and handles REST responses.
  - `internal/domain/`: Defines typed structures for the unified 9-status print-shop lifecycle, customers, locations, time entries, line items, and audit trails.

### 2. Electron Desktop Client (`apps/desktop/`)

- **Role**: Provides a secure, containerized native application for on-premise shop machines.
- **IPC-to-HTTP Gateway**:
  - **Renderer**: The UI is isolated. It only has access to `window.api` exposed via `apps/desktop/src/preload/`.
  - **Preload Bridge**: Forwards operations to the main process via standard Electron `ipcRenderer.invoke`.
  - **Main Process**: Listens to IPC channels. Instead of parsing JSON fixtures directly, it instantiates `createConfiguredIrisApiClient` (`src/main/shared/iris-api-client.ts`), executing requests against the `iris-api` server via standard HTTP.
- **Configurations**: Configuration values (such as `baseUrl` of the API) are resolved at launch via `runtime-config.ts` from environment configurations in `apps/desktop/config/`.

### 3. Web Client (`apps/web/`)

- **Role**: Offers a lightweight browser-based alternative for operators, managers, and remote trackers.
- **Dual Runtime Adapter**:
  - Located in `apps/web/src/lib/web-api.ts`.
  - **HTTP Mode**: Communicates directly with the `iris-api` server via fetch operations.
  - **Fixtures Mode**: Runs a simulated, fully stateful local environment inside the browser's memory, pulling initial records from `fixtures/`. This makes client-only testing and sandbox development zero-overhead.
- **Public Status Portal**: Connects to the public endpoint `/public/work-orders/{token}`, allowing print clients to view real-time production status and record digital sign-offs.

---

## Shared Domain Model

The workspace shares a single, rich operational model defined in TypeScript (`apps/web/src/types/work-order.ts`, `apps/desktop/model/work-order.ts`) and Go (`iris-api/internal/domain/types.go`).

### Lifecycle States
Work orders transition sequentially:
1. `new`: Order registered, awaiting details.
2. `assigned`: Dispatched to an active operator.
3. `inProgress`: Production has begun.
4. `waitingForCustomer`: Awaiting customer approval, print proofs, or sign-offs.
5. `waitingForMaterials`: Production blocked by supply levels.
6. `completed`: Physical production finished.
7. `cancelled`: Job aborted.
8. `invoiced`: Work order billed, line items compiled, and invoice registered.

---

## Data and Request Flows

### Authenticated Desktop Flow

```text
1. Renderer calls: window.api.getWorkOrders()
2. Preload invokes Electron IPC: 'workorders:getAll'
3. Main process interceptor catches call in WorkOrder.async.ts
4. Main process initiates: createConfiguredIrisApiClient().getWorkOrders()
5. Client performs GET request to: http://127.0.0.1:8080/work-orders
6. Go Server (iris-api) validates, reads from internal/store, returns JSON array
7. Main process returns data back to Electron IPC channel
8. React Renderer updates UI tables and charts
```

### Web Client Boot Sequence

```text
1. Vite app mounts main.tsx
2. Checks VITE_IRIS_API_MODE (e.g., 'http' or 'fixtures')
3. Configures window.api to use either:
   - createHttpApi(baseUrl) via apps/web/src/lib/api-client.ts
   - createFixtureApi() stateful mock via apps/web/src/lib/web-api.ts
4. AppShell loads, displaying authentication or dashboard charts
```

---

## Testing Boundary Guidelines

1. **Go API Tests**: Run from `iris-api/` with `go test ./...`. Ensures routers, JSON serialization, and fixture logic are completely verified.
2. **Desktop Renderer Tests**: Located alongside React components. Stub `window.api` calls using Vitest `vi.stubGlobal('api', ...)`.
3. **Web Client Tests**: Located under `apps/web/` using Vitest to test page interactions and API adapter operations.

*Last verified against the checked-in repository state on 2026-05-31.*
