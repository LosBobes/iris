---
name: add-desktop-ipc
description: Add or change an Electron IPC handler in apps/desktop, wiring all four layers (handler, registration, preload bridge, types). Use when exposing a new main-process capability to the desktop renderer via window.api.
---

# Add a desktop IPC handler

The desktop app's only renderer↔main boundary is the preload `window.api` bridge.
A new IPC capability is not done until **all four** layers are wired — a missing
step shows up as a runtime "not a function" in the renderer or a type error.

## The 4 steps (do all, together)

1. **Handler** — `apps/desktop/src/main/<Feature>/<Feature>.async.ts`.
   Register `ipcMain.handle('feature:action', async (_e, payload) => { ... })`.
   Validate the payload, keep logic thin, delegate data work to
   `src/main/shared/iris-api-client.ts` (`IrisApiClient`), `await` everything,
   wrap in `try/catch`.
2. **Register** — call the handler's registration from
   `apps/desktop/src/main/index.ts` inside `app.whenReady()`.
3. **Expose** — in `apps/desktop/src/preload/index.ts`, add the method to the
   `api` object as `ipcRenderer.invoke('feature:action', payload)`.
4. **Type** — add the method signature to the `Window['api']` interface in
   `apps/desktop/src/preload/index.d.ts`.

## Rules

- IPC uses `invoke`/`handle` only — never `send`/`on`.
- Channel names are `feature:action` (`auth:login`, `workorders:getAll`).
- The renderer calls only `window.api.<method>` — never `fetch()` or Node APIs
  directly, never bypass preload.
- Errors surfaced to the user are Serbian; code/comments/tests English.
- Mutating handlers: ensure the renderer refreshes local state afterward so the UI
  doesn't go stale.

## Test

Colocate a `<Feature>.async.test.ts` for the handler. In renderer/hook tests, stub
the bridge with `vi.stubGlobal('api', { yourMethod: vi.fn() })`.

```bash
cd apps/desktop && npm run typecheck && npm test
```

## Report

Confirm all four files were edited and name them; note the channel name and any
renderer hook/page that now consumes it.
