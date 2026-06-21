---
name: sync-domain-contract
description: Add or change a shared domain field (e.g. a WorkOrder or Customer field) consistently across the Go API, both frontends, and fixtures. Use when a field must exist end to end and you need to avoid silent drift between surfaces.
---

# Sync a shared domain shape across all surfaces

Iris has four+ places that must agree on a domain shape. Missing one is the
single most common review escape in this repo. Use this checklist whenever a
field is added, removed, renamed, or retyped.

## The sync points (change together)

| # | File | When |
| - | --- | --- |
| 1 | `iris-api/openapi.yaml` | always — source of truth |
| 2 | `iris-api/internal/domain/types.go` | always — Go struct + JSON tags |
| 3 | `iris-api/internal/store/sqlite.go` + `migrations.go` | if persisted (add a migration; never edit an applied one) |
| 4 | `iris-api/internal/store/fixtures.go` + `iris-api/testdata/fixtures/` | test/seed data |
| 5 | `apps/web/src/types/work-order.ts` | web type |
| 6 | `apps/web/src/fixtures/` | web fixture-mode seed |
| 7 | `apps/desktop/model/work-order.ts` | desktop type |
| 8 | `apps/desktop/src/renderer/src/types/work-order.ts` | renderer type — keep in sync with #7 |

## Procedure

1. Define the field in `openapi.yaml` first (name, type, required, description).
2. Mirror it in `domain/types.go` with matching JSON tags.
3. If persisted: add a new migration in `migrations.go` and read/write it in
   `sqlite.go`. Update the SQLite store tests.
4. Update both store fixtures and the API fixture tests.
5. Update web + desktop types and their fixtures.
6. **New required field** → add a sensible default in the web
   `normalizeWorkOrder()` (`apps/web/src/lib/api-client.ts` and `fixture-api.ts`)
   so API/fixture data loading doesn't break; decide a default for existing rows
   in the migration.
7. Keep visible strings Serbian, code/tests English; dates as `YYYY-MM-DD`.

## Validate

```bash
cd iris-api && go test ./...
cd apps/web && npm test && npm run build
cd apps/desktop && npm run typecheck && npm test
```

## Report

List every file touched against the table above, confirm none were skipped, and
state the checks you ran per surface.
