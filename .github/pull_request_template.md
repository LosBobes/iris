<!--
Iris pull request template. Fill in the sections that apply and delete the
rest. Keep code, comments, and this description in English; user-facing UI
strings stay Serbian (sr-Latn). See CLAUDE.md and REPO_MAP.md.
-->

## Summary

<!-- What does this PR do and why? One or two sentences. Link any issue. -->

## Surfaces touched

<!-- Tick every deployable this PR changes. -->

- [ ] API (`iris-api/`)
- [ ] Web (`apps/web/`)
- [ ] Desktop (`apps/desktop/`)
- [ ] Docs / tooling only

## What changed

<!-- Bullet the notable changes. Call out new/changed endpoints, domain
     fields, migrations, settings flags, or UI. -->

-

## Contract-sync

<!-- A shared domain/shape change must land across all surfaces or they drift.
     Tick what applies, or write "N/A — single surface" if it does not. -->

- [ ] `iris-api/openapi.yaml` (HTTP contract)
- [ ] `iris-api/internal/domain/types.go`
- [ ] `iris-api/internal/store/` (+ `migrations.go` if persisted)
- [ ] `apps/web/src/types/` + zod validation
- [ ] `apps/desktop/model/`
- [ ] Fixtures & tests
- [ ] N/A — change touches a single surface only

## Testing

<!-- Which per-surface checks did you run? There is no CI beyond a manual
     Copilot workflow, so run these yourself. Paste anything notable. -->

- [ ] Backend: `go test ./...` (from `iris-api/`)
- [ ] Web: `npm run lint && npm test && npm run build` (from `apps/web/`)
- [ ] Desktop: `npm run typecheck && npm test && npm run lint && npm run build` (from `apps/desktop/`)

## Screenshots / notes

<!-- Optional: UI screenshots, migration notes, follow-up work, or known
     limitations reviewers should be aware of. -->
