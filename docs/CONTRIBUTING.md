# Contributing

This repository currently contains Iris, a desktop application for Stamparija Cobanovic.
The active code lives in `apps/desktop/`.

Use this guide together with:

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_GLOSSARY.md`
- `docs/DECISIONS.md`

## Current Scope

- The working application in this checkout is `apps/desktop`.
- The root `README.md` mentions an `iris-api` module, but that directory is not present in the current repository state.
- Unless a task explicitly says otherwise, run project commands from `apps/desktop/`.

## Prerequisites

- Node.js and npm
- A desktop environment capable of running Electron during local development

## Setup

```bash
cd apps/desktop
npm install
```

## Common Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

Useful one-off test command:

```bash
npx vitest run src/renderer/src/lib/dashboard/aggregations.test.ts
```

## Development Workflow

1. Start from a focused branch.
2. Keep changes narrow and reviewable.
3. Follow the existing Electron split:
   - `src/main/` for main-process logic
   - `src/preload/` for the typed bridge
   - `src/renderer/src/` for React UI
4. If you add a new IPC method, update all three layers:
   - main handler
   - preload runtime bridge
   - preload TypeScript declarations
5. Run `npm run lint`, `npm run typecheck`, and `npm run test` before handing work off.
6. Update docs when behavior, architecture, or terminology changes.

## Code Organization Rules

- Organize by feature, not by file type.
- Keep shared domain models in `apps/desktop/model/`.
- Keep renderer-specific types in `apps/desktop/src/renderer/src/types/` when the UI needs a richer shape.
- Keep hooks that call `window.api` in `apps/desktop/src/renderer/src/hooks/`.
- Register new IPC handlers in `apps/desktop/src/main/index.ts`.
- Keep `apps/desktop/src/preload/index.ts` and `apps/desktop/src/preload/index.d.ts` in sync.
- Use the `@` alias for renderer imports. It resolves to `apps/desktop/src/renderer/src/`.

## UI And Language Conventions

- Visible UI text should be Serbian, in Latin script.
- Code identifiers, filenames, and comments should stay in English.
- Tailwind is v4. Use the existing Tailwind setup instead of older v3 patterns.
- Reuse existing UI primitives and utilities before adding new ones.

## Data And Environment Expectations

- Authentication and work-order data are currently loaded from JSON fixtures in `apps/desktop/fixtures/`.
- Treat fixture-backed auth and data access as temporary implementation choices, not final production architecture.
- If you change work-order fields, update both:
  - `apps/desktop/model/work-order.ts`
  - `apps/desktop/src/renderer/src/types/work-order.ts`

## Testing Expectations

- Renderer tests run in jsdom with Vitest.
- Stub preload APIs in tests with `vi.stubGlobal('api', ...)`.
- Prefer colocated test files near the code they validate.
- Add or update regression tests when changing filtering, aggregation, auth flow, or dashboard rendering behavior.

## Pull Requests And Commits

- Keep PRs scoped to one feature slice when possible.
- Explain why the change exists, not just what changed.
- Commit messages should follow the repository's Lore-style structure:
  - intent-first subject
  - optional explanatory body
  - useful trailers such as `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Directive:`, `Tested:`, and `Not-tested:`
- Call out any temporary behavior, follow-up work, or known gaps in the PR description.

## When To Update Docs

Update docs in the same change when you:

- add or rename IPC channels
- change domain types or glossary terms
- change developer workflow or required commands
- introduce or retire an architectural boundary
- replace fixture data with a persistent or remote data source

## Security Notes For Contributors

- Do not treat the renderer role gate as a strong security boundary.
- Be careful when changing preload exposure; anything added there becomes reachable from renderer code.
- If you change auth, data loading, or Electron window security settings, review `apps/desktop/desktop-threat-model.md`.
