---
name: build-ui-component
description: Build or modify a React UI component, page, or shadcn primitive in the Iris web app (apps/web) following this repo's conventions — shadcn/ui, Tailwind v4, Serbian UI strings, react-hook-form + zod, and window.api data.
---

# Build an Iris UI component / page

Applies to `apps/web/src/`. React 19 + TS + Tailwind v4. Read the surface guide
first (`apps/web/AGENTS.md`).

## Before writing — decide scope

- **Reuse first.** Check `components/ui/` (shadcn primitives) and existing feature
  components before creating anything. Prefer composing primitives over new CSS.

## Conventions (non-negotiable)

- **shadcn/ui + Tailwind v4.** Variants via `class-variance-authority`; merge
  classes with `tailwind-merge`/`clsx` (the `cn()` helper in `lib/utils.ts`). Icons
  from `lucide-react` / `@phosphor-icons/react`.
- **Serbian visible text** (`sr-Latn`) — labels, buttons, placeholders, toasts
  (`sonner`), empty/error states. Code, props, comments, tests in English. Check
  `docs/DOMAIN_GLOSSARY.md` for the right term.
- **Data via `window.api`** through hooks (`useWorkOrders`, `useAuth`,
  `useDashboardData`) — never raw `fetch()` in a component.
- **Forms:** `react-hook-form` + `zod` via `@hookform/resolvers`. Web work-order
  schema lives in `src/lib/work-orders/validation.ts`. Validate before submitting.
- **Dates:** display `DD.MM.YYYY`, store `YYYY-MM-DD` (web: `src/lib/i18n-date.ts`).
- **State coverage:** every data-driven view handles loading / error / empty /
  filtered-empty. Mutations must refresh local state so the UI doesn't go stale.
- **Accessibility:** semantic HTML (`<button>`, `<nav>`, `<main>`), keyboard
  access, ARIA labels on icon-only controls.

## React 19 practices

- Functional components only. `ref` is a plain prop (no `forwardRef`); render
  context directly (no `Context.Provider`). No per-file React import.
- Reach for `useActionState`/`useFormStatus` (pending state), `useOptimistic`
  (optimistic mutations), `startTransition`/`useDeferredValue` (responsiveness)
  only where they earn their keep. Don't over-memoize.

## Adding a new page/route

Add the route with `react-router-dom`; pages live in `src/pages/`.

## Adding a new shadcn primitive

Place it in `components/ui/`, match the existing primitives' API and `cn()` usage,
and keep it presentational (no data fetching). Reuse it from feature components.

## Test & check

- Vitest, colocated `*.test.tsx`, written in English. Stub the API surface with
  `vi.stubGlobal('api', { method: vi.fn() })`.

```bash
cd apps/web && npm run lint && npm test
```

## Report

- Files added/changed and which surface(s).
- Whether a matching edit in the other frontend is still owed.
- Checks run.
