# Iris Project Context

Compact repository context for Iris, the operations suite for Stamparija
Cobanovic.

## Project Overview

| Aspect | Desktop Client | Web Client | Backend API |
| --- | --- | --- | --- |
| Path | `apps/desktop` | `apps/web` | `iris-api` |
| Runtime | Electron 39 / electron-vite 5 | Vite | Go 1.25+ |
| UI | React 19 / TypeScript 5.9 | React 19 / TypeScript 5.9 | OpenAPI v3 contract |
| Styling | Tailwind CSS 4 | Tailwind CSS 4 | N/A |
| Data access | IPC to `IrisApiClient` | HTTP or fixture adapter | SQLite or fixture store |

## Repository Structure

```text
.
├── apps/
│   ├── desktop/                Electron desktop app
│   │   ├── model/              Desktop-facing domain types
│   │   └── src/
│   │       ├── main/           Main process, IPC handlers, API client
│   │       ├── preload/        Typed context bridge
│   │       └── renderer/src/   React renderer
│   └── web/                    Browser client
│       ├── src/
│       │   ├── components/     UI widgets, forms, dashboard charts
│       │   ├── fixtures/       Browser fixture mode seed data
│       │   ├── hooks/          Data and page hooks
│       │   ├── lib/            HTTP client and fixture adapter
│       │   ├── pages/          Dashboard, customers, public tracking, work orders
│       │   └── types/          Shared TypeScript domain types
│       └── vite.config.ts
├── iris-api/                   Go backend API
│   ├── cmd/
│   │   ├── irisctl/            Migrations, seeding, imports, users, backup
│   │   └── server/             API server entry point
│   ├── internal/
│   │   ├── api/                Chi routes, middleware, handlers, tests
│   │   ├── domain/             Go domain and payload structs
│   │   └── store/              Store interface, fixtures, SQLite
│   ├── testdata/fixtures/      API fixture data
│   └── openapi.yaml
└── docs/                       Architecture, decisions, glossary, contribution policy
```

## Runtime Boundaries

### Desktop Client

- Renderer code calls `window.api`.
- The preload bridge exposes only typed IPC methods.
- The main process owns privileged Electron access and the HTTP API client.
- API base URL configuration is resolved in
  `apps/desktop/src/main/shared/runtime-config.ts`.

### Web Client

- `apps/web/src/lib/web-api.ts` installs the browser `window.api` surface.
- `VITE_IRIS_API_MODE=http` uses `apps/web/src/lib/api-client.ts` against
  `iris-api`.
- `VITE_IRIS_API_MODE=fixtures` uses in-browser state seeded from
  `apps/web/src/fixtures`.
- Browser routes include authenticated app pages and public work-order tracking.

### Backend API

- `cmd/server` selects SQLite when `IRIS_DB_PATH` is set.
- Empty `IRIS_DB_PATH` uses `testdata/fixtures` outside production.
- Production requires persistent storage and a session secret.
- `cmd/irisctl` owns migrations, demo seeding, CSV import, user creation, and
  backup operations.

## Domain Snapshot

Work orders use an expanded operational schema:

- normalized `Customer` and `Location`
- assignment with operator, priority, and scheduled date
- canonical statuses: `new`, `assigned`, `inProgress`,
  `waitingForCustomer`, `waitingForMaterials`, `completed`, `cancelled`,
  `invoiced`
- separate internal and customer notes
- materials, time entries, attachments, events, and invoice draft fields
- public communication token for external status lookup

Keep TypeScript types, Go structs, OpenAPI schemas, fixture data, and tests in
sync when any domain field changes.

## Command Map

Desktop:

```bash
cd apps/desktop
npm run lint
npm run typecheck
npm test
npm run build
```

Web:

```bash
cd apps/web
npm run lint
npm run build
npm test
```

Backend:

```bash
cd iris-api
go test ./...
```

## Docs Map

- `docs/ARCHITECTURE.md`: topology, runtime boundaries, request flow, and
  verification boundaries.
- `docs/DECISIONS.md`: accepted and temporary architecture decisions.
- `docs/DOMAIN_GLOSSARY.md`: Serbian UI labels mapped to English code and API
  terms.
- `docs/CONTRIBUTING.md`: local commands, verification rules, and commit policy.
- `iris-api/README.md`: backend endpoint, configuration, CLI, and smoke-check
  reference.

*Last verified against the checked-in repository state on 2026-06-01.*
