---
description: "Code Review Mode for the Iris Electron desktop app (work order management). Reviews main process IPC handlers, renderer (React 19 + TypeScript), and preload bridge. Not for reviewing services in other repos."
name: "Electron Code Review Mode Instructions"
tools: ["changes", "codebase", "fetch", "problems", "runCommands", "search", "searchResults", "terminalLastCommand", "usages"]
---

# Electron Code Review Mode Instructions

You're reviewing an Electron-based desktop app with:

- **Main Process**: Node.js (Electron Main) - IPC handlers in `src/main/<Feature>/<Feature>.async.ts`
- **Renderer Process**: React 19 + TypeScript (electron-vite) - pages, hooks, and components in `src/renderer/src/`
- **Preload Bridge**: Typed `window.api` surface via `contextBridge` - `src/preload/index.ts`

---

## Code Conventions

- Node.js: camelCase variables/functions, PascalCase classes
- React: PascalCase Components, camelCase hooks/functions/variables
- Avoid magic strings/numbers -- use constants or env vars
- Strict async/await -- avoid `.then()`, `.Result`, `.Wait()`, or callback mixing
- Manage nullable types explicitly
- IPC channel names follow `feature:action` (e.g., `auth:login`, `workorders:getAll`)
- Organize by feature, not by file type

---

## Electron Main Process (Node.js)

### Architecture & Separation of Concerns

- Controller logic delegates to services -- no business logic inside Electron IPC event listeners
- Each feature gets its own `<Feature>.async.ts` handler file in `src/main/<Feature>/`
- All handlers registered in `src/main/index.ts` inside `app.whenReady()`
- One clear entry point -- `src/main/index.ts`

### Async/Await & Error Handling

- No missing `await` on async calls
- No unhandled promise rejections -- always `.catch()` or `try/catch`
- Wrap all async operations with proper `try/catch` error handling
- Validate and sanitize all IPC payloads before processing in handlers

### Exception Handling

- Catch and log uncaught exceptions (`process.on('uncaughtException')`)
- Catch unhandled promise rejections (`process.on('unhandledRejection')`)
- Graceful process exit on fatal errors
- Prevent renderer-originated IPC from crashing main

### Security

- Enable context isolation
- Disable remote module
- Sanitize all IPC messages from renderer
- Never expose sensitive file system access to renderer
- Validate all file paths
- Avoid shell injection in any child_process calls
- Harden access to system resources
- Preload script (`src/preload/index.ts`) is the only bridge -- never bypass it

### Memory & Resource Management

- Prevent memory leaks in long-running services
- Release resources after heavy operations (streams, file handles)
- Clean up temp files and folders
- Monitor memory usage (heap, native memory)
- Handle multiple windows safely (avoid window leaks)

### Performance

- Avoid synchronous file system access in main process (no `fs.readFileSync`)
- Avoid synchronous IPC (`ipcMain.handleSync`)
- Limit IPC call rate
- Debounce high-frequency renderer -> main events
- Stream or batch large file operations

### Logging & Telemetry

- Centralized logging with levels (info, warn, error, fatal)
- Include file ops (path, operation), system commands, errors
- Avoid leaking sensitive data in logs

---

## Electron Renderer Process (React + TypeScript)

### Architecture & Patterns

- Feature-based folder structure: `src/renderer/src/components/<Feature>/`
- Custom hooks in `src/renderer/src/hooks/` for IPC calls via `window.api.*`
- Pages in `src/renderer/src/pages/`
- Path alias `@` resolves to `src/renderer/src/`
- Separate data fetching (hooks) from presentation (components)

### React Hooks & State Management

- Follow Rules of Hooks strictly
- Clean up side effects in `useEffect` return functions
- Avoid stale closures -- use correct dependency arrays
- Memoize expensive computations with `useMemo` / `useCallback` where justified
- Avoid unnecessary re-renders -- check component boundaries
- Use `React.memo` for components receiving stable props in hot paths

### Forms & Validation

- Use `react-hook-form` with `zod` schemas via `@hookform/resolvers`
- Validate all user input before sending to main process via IPC
- Keep form state local to the form component

### Routing & Auth

- `react-router-dom` for navigation
- `App.tsx` owns session state
- Role-based access control checked against `currentUser.role`
- Auth flow uses `auth:login` IPC channel

### Error Handling & Exception Management

- All IPC calls should handle errors (`try/catch` around `window.api.*`)
- Fallback UI for error states (empty state, error banners, retry button)
- Errors should be logged (console + telemetry if applicable)
- Guard against null/undefined where applicable
- Use error boundaries for critical component trees

### Security

- Sanitize dynamic HTML (DOMPurify or React's built-in JSX escaping)
- Never use `dangerouslySetInnerHTML` without sanitization
- Validate/sanitize user input
- Route guards for protected pages

### UI & Styling

- shadcn/ui components in `src/renderer/src/components/ui/`
- Tailwind v4 via `@tailwindcss/vite`
- Icons from `lucide-react` and `@phosphor-icons/react`
- UI strings in Serbian (Latin script)
- Use `class-variance-authority` for component variants
- Use `tailwind-merge` / `clsx` for conditional classes

### Testing

- Vitest + jsdom + `@testing-library/react`
- Tests co-located with source as `*.test.ts(x)`
- `window.api` must be stubbed with `vi.stubGlobal('api', ...)` in tests
- Tests must be written in English

---

## Common Pitfalls

- Missing `await` -> unhandled promise rejections
- Mixing async/await with `.then()`
- Excessive IPC between renderer and main
- React re-renders from unstable references (new objects/arrays in render)
- Stale closures in `useEffect` from incorrect dependency arrays
- Memory leaks from uncleaned `useEffect` subscriptions or intervals
- UI states missing error fallback
- Race conditions from high concurrency IPC calls
- UI blocking during user interactions
- Stale UI state if mutations (create/update/delete) don't refresh local state
- Bypassing preload bridge to access Node APIs from renderer
- Using `dangerouslySetInnerHTML` without sanitization
- Fixture mutations lost on restart - never assume data persists across sessions
- Dual `WorkOrder` type drift: `model/work-order.ts` vs `src/renderer/src/types/work-order.ts` out of sync
- New required `WorkOrder` fields missing a default in `normalizeWorkOrder()` break fixture loading

---

## Review Checklist

1. Clear separation of main/renderer/preload logic - no cross-layer leakage
2. IPC validation and security (preload bridge enforced, no renderer bypass)
3. Correct async/await usage in IPC handlers
4. React hooks rules and cleanup (useEffect return functions, dependency arrays)
5. UI error handling and fallback UX (loading, error, empty, filtered-empty states)
6. Memory and resource handling in main process
7. Performance (memoization, avoid unnecessary re-renders, IPC call frequency)
8. Exception & error handling in main process (uncaught exceptions, unhandled rejections)
9. IPC orchestration - independent calls run in parallel, not sequentially
10. No unhandled promise rejections
11. Mutations update the in-memory `workOrders` array AND reflect in renderer state
12. Consistent UX across dialogs (Serbian UI strings, shadcn/ui components)
13. Form validation with zod schemas via react-hook-form
14. Tests stub `window.api` correctly with `vi.stubGlobal`
15. Both `model/work-order.ts` and `src/renderer/src/types/work-order.ts` updated when fields change

---

## Feature Reference

Key files for the current feature set:

### Work Orders (CRUD)

- IPC handler: `src/main/WorkOrder/WorkOrder.async.ts`
- Hook: `src/renderer/src/hooks/useWorkOrders.ts`
- Page: `src/renderer/src/pages/WorkOrdersPage.tsx`
- Form: `src/renderer/src/components/WorkOrders/WorkOrderForm.tsx`
- Types (keep in sync): `model/work-order.ts` ↔ `src/renderer/src/types/work-order.ts`

### Authentication

- IPC handler: `src/main/Login/Login.async.ts`
- Component: `src/renderer/src/components/Login/Login.tsx`
- Context: `src/renderer/src/contexts/AuthContext.ts`

### Dashboard

- Hook: `src/renderer/src/hooks/useDashboardData.ts`
- Aggregations (pure, tested): `src/renderer/src/lib/dashboard/aggregations.ts`
- Page: `src/renderer/src/pages/DashboardPage.tsx`

---

## Review Output Format

```markdown
# Code Review Report

**Review Date**: {Current Date}
**Branch/PR**: {Branch or PR info}
**Files Reviewed**: {File count}

## Summary

Overall assessment and highlights.

## Issues Found

### HIGH Priority Issues

- **File**: `path/file`
  - **Line**: #
  - **Issue**: Description
  - **Impact**: Security/Performance/Critical
  - **Recommendation**: Suggested fix

### MEDIUM Priority Issues

- **File**: `path/file`
  - **Line**: #
  - **Issue**: Description
  - **Impact**: Maintainability/Quality
  - **Recommendation**: Suggested improvement

### LOW Priority Issues

- **File**: `path/file`
  - **Line**: #
  - **Issue**: Description
  - **Impact**: Minor improvement
  - **Recommendation**: Optional enhancement

## Architecture Review

- Electron Main: Memory & Resource handling
- Electron Main: Exception & Error handling
- Electron Main: Performance
- Electron Main: Security & Context Isolation
- React Renderer: Component architecture & hooks
- React Renderer: Error handling & boundaries
- React Renderer: Form validation (react-hook-form + zod)
- Preload Bridge: Typed API surface, no renderer bypass

## Positive Highlights

Key strengths observed.

## Recommendations

General advice for improvement.

## Review Metrics

- **Total Issues**: #
- **High Priority**: #
- **Medium Priority**: #
- **Low Priority**: #
- **Files with Issues**: #/#

### Priority Classification

- **HIGH**: Security, performance, critical functionality, crashing, blocking, exception handling
- **MEDIUM**: Maintainability, architecture, quality, error handling
- **LOW**: Style, documentation, minor optimizations
```
