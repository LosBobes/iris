# Iris - Copilot Instructions

Iris is a multi-project workspace:

- `apps/desktop`: Electron desktop app for work order management, dashboard reporting, and authentication
- `iris-api`: Go HTTP API that mirrors the desktop contract and currently reads the same fixture data

Start from the source that matches the area you are changing:

- Workspace overview: [README.md](../README.md)
- Desktop business context: [docs/PROJECT_CONTEXT.md](../docs/PROJECT_CONTEXT.md)
- Desktop architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- Backend contract and workflow: [iris-api/README.md](../iris-api/README.md)
- Backend HTTP contract: [iris-api/openapi.yaml](../iris-api/openapi.yaml)

`docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` are still desktop-first. For backend work, trust `iris-api/README.md`, `openapi.yaml`, and the Go source.

## Workspace Boundaries

| Project | Path | Role |
|-------|------|------|
| Desktop app | `apps/desktop/` | Electron runtime, IPC surface, React UI |
| Backend API | `iris-api/` | Go HTTP service, contract-first, fixture-backed |

- The desktop renderer calls only `window.api`. Do not add direct HTTP `fetch()` calls from `apps/desktop/src/renderer/src/` unless the task explicitly includes that migration.
- The preload bridge is the only renderer-to-Electron boundary.
- `iris-api` is a separate Go module, not part of the Electron build. Keep Go server concerns out of `apps/desktop`, and keep Electron IPC concerns out of `iris-api`.
- The API mirrors desktop data needs, but the desktop app does not use it at runtime yet. Treat backend work and desktop integration work as separate tasks unless the user explicitly combines them.

## Desktop Architecture

Never mix these Electron layers:

| Layer | Path | Role |
|-------|------|------|
| Main process | `apps/desktop/src/main/` | Node/Electron APIs, IPC handlers, fixture loading |
| Preload bridge | `apps/desktop/src/preload/` | Typed `window.api` surface via `contextBridge` |
| Renderer | `apps/desktop/src/renderer/src/` | React UI, calls only `window.api` |

Shared domain types live in `apps/desktop/model/`. Renderer-only types live in `apps/desktop/src/renderer/src/types/`.

Desktop commands run from `apps/desktop/`:

```bash
npm run dev
npm run build
npm run test
npm run test:watch
npm run typecheck
npm run lint
npm run format
```

Desktop conventions:

- Code identifiers, filenames, comments, and tests stay in English.
- Visible UI text stays in Serbian (`sr-Latn`).
- Add routes in `apps/desktop/src/renderer/src/App.tsx`; the app uses `MemoryRouter`, not filesystem routing.
- Forms use `react-hook-form` with `zod` schemas.
- Reuse components from `apps/desktop/src/renderer/src/components/ui/` before creating new primitives.
- IPC uses `invoke`/`handle` only. No `send`/`on` listeners.

Desktop IPC changes always follow all 4 steps:

1. Add the handler in `apps/desktop/src/main/[Feature]/[Feature].async.ts`.
2. Register it from `apps/desktop/src/main/index.ts` inside `app.whenReady()`.
3. Expose it in `apps/desktop/src/preload/index.ts` with `ipcRenderer.invoke(...)`.
4. Update `apps/desktop/src/preload/index.d.ts`.

Desktop testing:

- Tests are colocated with the source they cover.
- Stub the preload surface with `vi.stubGlobal('api', { ... })`.
- Global test setup already lives in `apps/desktop/src/renderer/src/test/setup.ts`.

Desktop pitfalls:

- All current desktop data is fixture-backed. CRUD mutations are in-memory and are lost on restart.
- `apps/desktop/model/work-order.ts` and `apps/desktop/src/renderer/src/types/work-order.ts` must stay in sync.
- New required `WorkOrder` fields also need a default in `normalizeWorkOrder()`.
- Access control is UI-only; `currentUser.role === 'admin'` is not a security boundary.
- Desktop fixture loading checks `app.getAppPath()/fixtures/` first, then `process.cwd()/fixtures/`.
- Dates are stored as `YYYY-MM-DD` strings and displayed as `DD.MM.YYYY` via `formatWorkOrderDate()`.

## Backend Architecture

Keep the Go API layered and small:

- `iris-api/cmd/server/main.go`: process wiring only
- `iris-api/internal/api/`: router and HTTP handlers
- `iris-api/internal/domain/`: request, response, and domain shapes
- `iris-api/internal/store/`: fixture-backed data access
- `iris-api/internal/testutil/`: shared test helpers

Backend commands run from `iris-api/`:

```bash
go run ./cmd/server
go test ./...
go test ./internal/api
go test ./internal/store
```

Backend conventions:

- Keep handler logic thin; data access stays in `internal/store`.
- If you add or change an endpoint, update `iris-api/openapi.yaml`, `iris-api/internal/api/server.go`, and `iris-api/internal/api/server_test.go` together.
- `go mod tidy` is required when dependencies change.
- Default listen address is `:8080`; override with `IRIS_API_ADDR`.
- User-facing auth messages that mirror desktop behavior stay in Serbian. Code, comments, tests, and internal docs stay in English.

Backend pitfalls:

- Run server commands from `iris-api/`, not the repo root. `cmd/server/main.go` reads `../apps/desktop/fixtures`, so the working directory matters.
- The API is fixture-backed and stateless today. There is no persistence layer yet.
- `internal/api/server_test.go` and `internal/store/fixtures_test.go` are the main regression tests; update them with contract changes.

## Shared Data Rules

- `apps/desktop/fixtures/` is the current source of truth for both the Electron app and the Go API.
- Changes to auth or work-order shape often need coordinated updates in fixtures, desktop types, backend domain types, and `openapi.yaml`.
- If a task is only about the desktop app, do not add backend abstractions preemptively.
- If a task is only about the backend contract, do not rewire the renderer to use HTTP unless explicitly asked.
