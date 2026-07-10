# Contributing to Iris

Iris is a monorepo for Stamparija Cobanovic operations. Keep changes narrow,
verify the affected runtime, and keep domain contracts aligned across clients,
API, fixtures, and documentation.

Related references:

- [Project Context](PROJECT_CONTEXT.md)
- [Architecture](ARCHITECTURE.md)
- [Domain Glossary](DOMAIN_GLOSSARY.md)
- [Decisions](DECISIONS.md)

## Repository Scope

- `apps/desktop/`: Electron desktop app for local shop operations.
- `apps/web/`: React web app for browser operations, dashboards, customer
  management, and public tracking.
- `iris-api/`: Go HTTP API, authentication, SQLite persistence, fixtures, and
  operational CLI.
- `docs/`: project-level architecture, decisions, glossary, and workflow policy.

## Prerequisites

- Node.js 18+ and npm for frontend work.
- Go 1.26+ for backend work.
- Desktop environment capable of running Electron for desktop-client work.

## Local Runtime Commands

Backend API:

```bash
cd iris-api
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl migrate
IRIS_DB_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
IRIS_DB_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
```

Web client:

```bash
cd apps/web
npm install
npm run dev
```

Desktop client:

```bash
cd apps/desktop
npm install
npm run dev
```

## Verification Commands

Backend:

```bash
cd iris-api
go test ./...
```

Web:

```bash
cd apps/web
npm run lint
npm run build
npm test
```

Desktop:

```bash
cd apps/desktop
npm run lint
npm run typecheck
npm test
```

Use the smallest verification set that proves the change, then broaden it when
runtime boundaries, shared domain types, auth, persistence, or public APIs are
affected.

## Development Rules

Domain model changes must update all relevant layers:

- `iris-api/openapi.yaml`
- `iris-api/internal/domain/types.go`
- `apps/web/src/types/work-order.ts`
- `apps/desktop/model/work-order.ts`
- fixtures and tests for affected payloads

Desktop IPC changes must update:

- `apps/desktop/src/main/index.ts`
- the relevant main-process handler
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/index.d.ts`

Visible UI text must stay in Serbian Latin (`sr-Latn`). Code identifiers,
database columns, API JSON fields, and developer comments stay in English. Use
[DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md) for terminology.

## Pull Requests And Commits

Keep commits and pull requests focused on one logical slice.

Commit messages follow the repository Lore protocol:

```text
<intent-first subject>

<context and rationale>

Constraint: <external constraint>
Rejected: <alternative> | <reason>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Tested: <verification>
Not-tested: <known gap>
```

Useful trailers are preferred over filler trailers. Always include honest
verification coverage and known gaps.

## Documentation Updates

Update docs in the same change when modifying:

- backend API routes or desktop IPC channels
- runtime data flow or persistence boundaries
- domain models, statuses, or print-shop vocabulary
- roadmap items that have become active service behavior

*Last verified against the checked-in repository state on 2026-05-31.*
