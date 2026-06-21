---
name: "Update Iris API Contract"
description: "Update an Iris API endpoint safely. Use when adding, removing, or changing routes, request bodies, response shapes, handlers, or fixture-backed API behavior in iris-api."
argument-hint: "Describe the endpoint or contract change to make in iris-api"
agent: "agent"
---
Update the requested endpoint or contract change in the Iris backend.

Start by reading:

- [openapi.yaml](../../iris-api/openapi.yaml)
- [server.go](../../iris-api/internal/api/server.go)
- [server_test.go](../../iris-api/internal/api/server_test.go)

Requirements:

- Treat [openapi.yaml](../../iris-api/openapi.yaml) as the public HTTP contract.
- When an endpoint changes, update all of these together:
  - [openapi.yaml](../../iris-api/openapi.yaml)
  - [server.go](../../iris-api/internal/api/server.go)
  - [server_test.go](../../iris-api/internal/api/server_test.go)
- If request or response shapes change, update [types.go](../../iris-api/internal/domain/types.go).
- If persisted behavior changes, update [sqlite.go](../../iris-api/internal/store/sqlite.go) + [migrations.go](../../iris-api/internal/store/migrations.go) (and [fixtures.go](../../iris-api/internal/store/fixtures.go) + relevant tests).
- Keep handlers thin and keep data access in `internal/store/`.
- Run validation from `iris-api/` using the narrowest useful `go test` command first.
- If shared shape changes require client follow-up (`apps/web/src/types/work-order.ts`, `apps/desktop/model/work-order.ts`, fixtures), call that out explicitly instead of leaving drift.

Return:

- the files you changed
- the validation you ran
- any remaining client or fixture follow-up