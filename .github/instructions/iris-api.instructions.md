---
name: "Iris API Backend Instructions"
description: "Use when editing Go files, OpenAPI contracts, chi handlers, SQLite/fixture store logic, or Go tests under iris-api. Covers contract-first endpoint changes, SQLite-backed data rules, and backend command boundaries."
applyTo: "iris-api/**"
---
# Iris API Backend Instructions

Start with [iris-api/README.md](../../iris-api/README.md) and [iris-api/openapi.yaml](../../iris-api/openapi.yaml). Treat the desktop docs as secondary for backend-only tasks.

## Boundaries

- Work inside `iris-api/` unless the task explicitly includes coordinated client updates.
- Do not add Electron, preload, or renderer concerns to Go code.
- The web and desktop clients both call this HTTP API at runtime (web via `fetch`, desktop via main `IrisApiClient`); avoid changing the contract without coordinating the clients.

## Architecture

- Keep `iris-api/cmd/server/main.go` and `cmd/irisctl/main.go` as process wiring only.
- Keep routing, auth middleware, and handlers in `iris-api/internal/api/`.
- Keep request, response, and domain shapes in `iris-api/internal/domain/`.
- Keep data access in `iris-api/internal/store/` (SQLite store + migrations + seed; fixture store for tests).
- Do not add new abstraction layers unless the task actually needs one.

## Contract Changes

- Treat [iris-api/openapi.yaml](../../iris-api/openapi.yaml) as the public HTTP contract.
- When an endpoint changes, update [iris-api/openapi.yaml](../../iris-api/openapi.yaml), [iris-api/internal/api/server.go](../../iris-api/internal/api/server.go), and [iris-api/internal/api/server_test.go](../../iris-api/internal/api/server_test.go) together.
- If request or response shapes change, update [iris-api/internal/domain/types.go](../../iris-api/internal/domain/types.go).
- If persisted behavior changes, update [iris-api/internal/store/sqlite.go](../../iris-api/internal/store/sqlite.go) and [migrations.go](../../iris-api/internal/store/migrations.go) (and the fixture store + tests).

## Data Rules

- Production data lives in SQLite (`DATABASE_PATH`); JSON fixtures under `testdata/fixtures/` back tests and `irisctl seed-demo`.
- Shape changes ripple to the clients (`apps/web/src/types/work-order.ts`, `apps/desktop/model/work-order.ts`) and their fixtures; do not leave the projects drifting silently.
- User-facing auth messages that mirror client behavior stay in Serbian. Code, comments, tests, and internal docs stay in English.

## Commands

- Run backend commands from `iris-api/`, not the repo root.
- Use the narrowest useful validation first:
  - `go test ./internal/api`
  - `go test ./internal/store`
  - `go test ./...`
  - `go run ./cmd/server`
- Run `go mod tidy` when dependencies change.