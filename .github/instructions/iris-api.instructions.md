---
name: "Iris API Backend Instructions"
description: "Use when editing Go files, OpenAPI contracts, chi handlers, fixture-store logic, or Go tests under iris-api. Covers contract-first endpoint changes, fixture-backed data rules, and backend command boundaries."
applyTo: "iris-api/**"
---
# Iris API Backend Instructions

Start with [iris-api/README.md](../../iris-api/README.md) and [iris-api/openapi.yaml](../../iris-api/openapi.yaml). Treat the desktop docs as secondary for backend-only tasks.

## Boundaries

- Work inside `iris-api/` unless the task explicitly includes coordinated desktop updates.
- Do not add Electron, preload, or renderer concerns to Go code.
- The desktop app does not call the HTTP API at runtime yet; avoid integration rewires unless asked.

## Architecture

- Keep `iris-api/cmd/server/main.go` as process wiring only.
- Keep routing and handlers in `iris-api/internal/api/`.
- Keep request, response, and domain shapes in `iris-api/internal/domain/`.
- Keep fixture-backed data access in `iris-api/internal/store/`.
- Do not add new abstraction layers unless the task actually needs one.

## Contract Changes

- Treat [iris-api/openapi.yaml](../../iris-api/openapi.yaml) as the public HTTP contract.
- When an endpoint changes, update [iris-api/openapi.yaml](../../iris-api/openapi.yaml), [iris-api/internal/api/server.go](../../iris-api/internal/api/server.go), and [iris-api/internal/api/server_test.go](../../iris-api/internal/api/server_test.go) together.
- If request or response shapes change, update [iris-api/internal/domain/types.go](../../iris-api/internal/domain/types.go).
- If fixture-backed behavior changes, update [iris-api/internal/store/fixtures.go](../../iris-api/internal/store/fixtures.go) and the relevant tests.

## Data Rules

- Shared data still comes from `apps/desktop/fixtures/`.
- Shape changes can require coordinated updates in desktop fixtures and types; do not leave the projects drifting silently.
- User-facing auth messages that mirror desktop behavior stay in Serbian. Code, comments, tests, and internal docs stay in English.

## Commands

- Run backend commands from `iris-api/`, not the repo root.
- Use the narrowest useful validation first:
  - `go test ./internal/api`
  - `go test ./internal/store`
  - `go test ./...`
  - `go run ./cmd/server`
- Run `go mod tidy` when dependencies change.