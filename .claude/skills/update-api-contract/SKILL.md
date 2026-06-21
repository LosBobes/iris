---
name: update-api-contract
description: Update an iris-api endpoint or contract safely, keeping OpenAPI, Go handlers, domain types, store, tests, and client types aligned. Use when adding, removing, or changing routes, request bodies, response shapes, handlers, or persisted API behavior.
---

# Update the Iris API contract

`iris-api/openapi.yaml` is the public HTTP contract and the source of truth. An
endpoint or shape change must land across every coupled file in the same change,
or the surfaces drift silently.

## 1. Read first

- `iris-api/openapi.yaml`
- `iris-api/internal/api/server.go`
- `iris-api/internal/api/server_test.go`
- `iris-api/internal/domain/types.go` (if shapes change)

## 2. Apply the change together

**Always (endpoint behavior or routing):**
- `iris-api/openapi.yaml`
- `iris-api/internal/api/server.go` (keep handlers thin; data access in `store`)
- `iris-api/internal/api/server_test.go`

**If request/response shapes change:**
- `iris-api/internal/domain/types.go`

**If persisted behavior changes:**
- `iris-api/internal/store/sqlite.go` and `internal/store/migrations.go`
- `iris-api/internal/store/fixtures.go` + `fixtures_test.go` (fixture store used in
  tests / `seed-demo`)

**If a shared domain shape changes**, it also ripples to the clients (see the
contract-sync rule in the repo root `CLAUDE.md`):
- `apps/web/src/types/work-order.ts`
- `apps/desktop/model/work-order.ts` (+ default in `normalizeWorkOrder()` for new
  required fields)
- fixtures consumed by each app

## 3. Conventions

- Keep the existing chi + stdlib patterns; don't add frameworks.
- User-facing auth messages mirroring client behavior stay in Serbian; code,
  comments, tests, docs in English.
- Run `go mod tidy` if dependencies changed.

## 4. Validate (from `iris-api/`, not repo root)

Narrowest useful check first, then widen:

```bash
go test ./internal/api
go test ./internal/store
go test ./...
```

## 5. Report

- Files changed.
- Validation run and result.
- Any remaining client follow-up (web types, desktop model, app fixtures) — call
  it out explicitly instead of leaving drift. If the change crosses surfaces,
  consider whether the user wanted that or a backend-only change.
