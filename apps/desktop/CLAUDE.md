# Iris Desktop — Electron guidance

Scope: everything under `apps/desktop/`. Electron 39 + electron-vite + React 19.
On-prem terminal client. Start with [README.md](README.md).

Data is **HTTP-backed via `IrisApiClient`** (`src/main/shared/iris-api-client.ts`),
not fixture-backed at runtime — older docs calling the desktop app fixture-backed
are stale. Configure the API base via `apps/desktop/.env`
(`IRIS_API_BASE_URL=http://localhost:8080`) or `config/development.ts` /
`production.ts`.

## Never mix these layers

| Layer | Path | Role |
| --- | --- | --- |
| Main | `src/main/` | Node/Electron APIs, IPC handlers, `IrisApiClient`, runtime-config |
| Preload | `src/preload/` | Typed `window.api` via `contextBridge` |
| Renderer | `src/renderer/src/` | React UI — calls only `window.api` |

- The renderer calls only `window.api`; do not add direct HTTP `fetch()` from the
  renderer. The preload bridge is the only renderer↔Electron boundary — never
  bypass it.
- Shared domain types: `model/` (e.g. `model/work-order.ts`, a contract-sync
  point — see root [CLAUDE.md](../../CLAUDE.md)). Renderer-only types:
  `src/renderer/src/types/`.

## Adding/changing an IPC handler — all 4 steps together

1. Add the handler in `src/main/<Feature>/<Feature>.async.ts`.
2. Register it from `src/main/index.ts` inside `app.whenReady()`.
3. Expose it in `src/preload/index.ts` with `ipcRenderer.invoke(...)`.
4. Update the typed surface in `src/preload/index.d.ts`.

IPC uses `invoke`/`handle` only (no `send`/`on`). Channel names follow
`feature:action` (`auth:login`, `workorders:getAll`). Keep handler logic thin and
`await` every async call; validate IPC payloads before use. Organize by feature,
not file type. The `add-desktop-ipc` skill walks this end to end.

## Conventions

- Routes added in `src/renderer/src/App.tsx` (`MemoryRouter`, not filesystem
  routing). Path alias `@` → `src/renderer/src/`.
- Reuse shadcn primitives in `src/renderer/src/components/ui/`. Forms:
  `react-hook-form` + `zod`. Tailwind v4.
- Visible UI text/messages in Serbian (`sr-Latn`); code/comments/tests in English.

## Testing

- Vitest + jsdom + `@testing-library/react`; tests colocated as `*.test.ts(x)`.
- Stub the bridge with `vi.stubGlobal('api', { ... })`.

## Commands

```bash
npm install && npm run dev
npm run typecheck && npm test && npm run lint && npm run build
npm run build:mac | build:win | build:linux
```

## Pitfalls

- Authorization gating is UI-only (`role === 'admin'`) — not a security boundary.
- Keep `model/work-order.ts` and `src/renderer/src/types/work-order.ts` in sync.
  New required `WorkOrder` fields also need a default where the web client
  normalizes API/fixture data (`apps/web/src/lib/api-client.ts` /
  `fixture-api.ts` `normalizeWorkOrder()`).
- `BrowserWindow` uses `sandbox: false`; preload isolation is good but not
  hardened to modern Electron defaults — don't loosen it further.
- Duplicates much of `apps/web`; shared changes often need the matching web edit.
