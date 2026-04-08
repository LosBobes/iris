# Iris — Copilot Instructions

Electron desktop app: work order management, dashboard reporting, and user authentication. All data is currently fixture-backed (no persistence).

See [docs/PROJECT_CONTEXT.md](../docs/PROJECT_CONTEXT.md) for business context and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for full architecture rationale.

## Architecture

Three-layer Electron split — never mix these layers:

| Layer | Path | Role |
|-------|------|------|
| Main process | `apps/desktop/src/main/` | Node/Electron APIs, IPC handlers, fixture loading |
| Preload bridge | `apps/desktop/src/preload/` | Typed `window.api` surface via context bridge |
| Renderer | `apps/desktop/src/renderer/src/` | React 19 UI, calls only `window.api` |

Shared domain types live in `apps/desktop/model/` (cross-process, imported by main and preload). Renderer-specific types live in `apps/desktop/src/renderer/src/types/`.

## Build and Test

All commands run from `apps/desktop/`:

```bash
npm run dev          # Electron + Vite HMR dev server
npm run build        # typecheck + electron-vite build → out/
npm run test         # Vitest (run mode)
npm run test:watch   # Vitest (watch mode)
npm run typecheck    # TS check for all three processes
npm run lint         # ESLint
npm run format       # Prettier
```

## Conventions

### Language split
- **Code** (identifiers, filenames, comments, tests): English
- **UI strings** (labels, buttons, toast messages): Serbian (`sr-Latn`)

### IPC — 4-step pattern for every new channel
1. Handler: `apps/desktop/src/main/[Feature]/[Feature].async.ts` — `ipcMain.handle('channel', handler)`
2. Register: call the registration function from `apps/desktop/src/main/index.ts` inside `app.whenReady()`
3. Preload: add method to `api` object in `apps/desktop/src/preload/index.ts` → `ipcRenderer.invoke('channel', payload)`
4. Types: add declaration to `window.api` in `apps/desktop/src/preload/index.d.ts`

Use only `invoke`/`handle` (request-response). No `send`/`on` listeners.

### Locale
- Append `lang=sr-Latn` via `app.commandLine.appendSwitch` (done in main)
- String sorting: `localeCompare(b, a, 'sr-Latn')`
- Display formatting: `.toLocaleString('sr-Latn-RS', { ... })`
- Dates stored as `YYYY-MM-DD` strings; displayed as `DD.MM.YYYY` via `formatWorkOrderDate()`

### Routing
`MemoryRouter` — not filesystem-based. Add routes in `App.tsx`.

### Forms
`react-hook-form` + `zod` schemas. Form components live in `src/renderer/src/components/[Feature]/`.

### Testing
Tests are colocated with source files. Stub the IPC surface in tests:
```ts
vi.stubGlobal('api', { methodName: vi.fn(), ... })
```
Global stub is already configured in `apps/desktop/src/renderer/src/test/setup.ts`.

## Pitfalls

**Fixture-backed, in-memory only** — all data loads from `apps/desktop/fixtures/`. CRUD mutations live in the main process in-memory array and are lost on restart. When backend integration arrives, keep backend concerns out of the renderer.

**Dual type schema** — `apps/desktop/model/work-order.ts` and `apps/desktop/src/renderer/src/types/work-order.ts` must stay in sync. Changing `WorkOrder` fields requires updating both files.

**`normalizeWorkOrder()`** — fixtures are normalized on load to fill missing fields with defaults. New required fields on `WorkOrder` need a corresponding default in `normalizeWorkOrder()`.

**Access control is UI-only** — `currentUser.role === 'admin'` gates the UI but is not a security boundary. Do not rely on it for sensitive operations.

**Fixture loading order** — main process searches `app.getAppPath()/fixtures/` first, then `process.cwd()/fixtures/`. Missing fixture files will throw at startup.
