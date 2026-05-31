# Iris Project Context

This document provides a fast, code-grounded summary of the Iris repository for quick context loading.

## Project Overview

**Iris** is a full-stack operations management suite for Stamparija Cobanovic. It includes a desktop shell, a web client, and a Go backend API.

| Aspect | Desktop Client | Web Client | Backend API |
| --- | --- | --- | --- |
| **Path** | `apps/desktop` | `apps/web` | `iris-api` |
| **Shell/Build** | Electron 39 / electron-vite 5 | Vite | Go 1.22+ |
| **UI Framework** | React 19 / TypeScript 5.9 | React 19 / TypeScript 5.9 | OpenAPI v3 Spec |
| **Styling** | Tailwind CSS 4 | Tailwind CSS 4 | N/A |
| **Charts** | Recharts 3 | Recharts 3 | N/A |
| **Database/Storage** | `iris-api` backend | Dual mode: HTTP Client or Local Fixture state | Fixture-backed memory store |

## Repository Structure

```text
.
├── apps/
│   ├── desktop/                Electron desktop app for local shop operations
│   │   ├── fixtures/           Local JSON fixtures (fallback)
│   │   ├── model/              Shared desktop domain types
│   │   └── src/
│   │       ├── main/           Electron main process (IPC-to-HTTP client forwarding)
│   │       ├── preload/        Typed context bridge
│   │       └── renderer/src/   React renderer mirroring desktop styles
│   └── web/                    React web app for browser operations
│       ├── public/             Favicon and public assets
│       ├── src/
│       │   ├── components/     UI widgets, CRM forms, dashboard charts
│       │   ├── fixtures/       Local JSON fixtures (fallback)
│       │   ├── hooks/          Data fetching and auth hooks
│       │   ├── lib/            HTTP client and local mock API adapters
│       │   ├── pages/          Dashboard, Create, Detail, Edit, List pages
│       │   └── types/          Expanded 9-status domain types
│       └── vite.config.ts
├── iris-api/                   Go backend API
│   ├── cmd/server/             API server entry point
│   ├── internal/
│   │   ├── api/                Chi routers, HTTP handlers, test suites
│   │   ├── domain/             Go structs matching the expanded domain model
│   │   └── store/              Fixture-backed memory store & seeding
│   ├── go.mod                  Go modules configuration
│   └── openapi.yaml            OpenAPI 3.0 specification contract
└── docs/                       Project documentation & decisions
```

## Desktop Client

Location: `apps/desktop/`

### Runtime Flow
1. **IPC Forwarding**: Rather than accessing JSON files directly, the main process is updated to act as a bridge. Renderer requests to `window.api` invoke Electron IPC handlers, which delegate to a typed `IrisApiClient` that communicates with `iris-api` via HTTP.
2. **Configuration**: Configured at runtime via `apps/desktop/src/main/shared/runtime-config.ts`, loading backend base URLs from development/production configurations.
3. **Preload Layer**: Located in `apps/desktop/src/preload/`, offering a secure context bridge.

## Web Client

Location: `apps/web/`

### Capabilities
- **Dual API Modes**: In `apps/web/src/lib/web-api.ts`, the app checks `VITE_IRIS_API_MODE`. It can run in `fixtures` mode (in-memory stateful client using browser memory) or `http` mode (making HTTP calls to `iris-api`).
- **Comprehensive CRM**: Features normalized `Customer` and `Location` auto-completions, client management panels, and clean creation workflows.
- **Advanced Dashboard**: Dynamic filters (date, operators) and data visualizations showing revenue, orders, delivery distribution, and top clients.

## Go Backend API

Location: `iris-api/`

- **Tech Stack**: Built with pure Go, standard library packages, and the Chi router.
- **Contract-First**: Defined fully in `openapi.yaml`, detailing endpoints for `/auth/login`, `/work-orders`, `/customers`, `/locations`, and public tracking.
- **Stateless Store**: The memory store in `internal/store` loads and seeds itself from `apps/desktop/fixtures/`, providing rich testing utilities and handlers.

## Expanded Domain Model

The domain model has transitioned from a basic 4-status model to a comprehensive print-shop operational schema.

### 1. WorkOrder Lifecycle
Managed through 9 distinct transition-controlled statuses:
- `new` -> `assigned` -> `inProgress` -> `waitingForCustomer` / `waitingForMaterials` -> `completed` -> `cancelled` -> `invoiced`
- An immutable `statusHistory` list tracks every transition, timestamp, and active operator.

### 2. Normalized Entities
- **Customer**: `id`, `name`, `contactName`, `email`, `phone`
- **Location**: `id`, `customerId`, `name`, `address`
- **Assignment**: Assigned operator (`assignedTo`), operational priority (`low` | `normal` | `high` | `urgent`), and `scheduledDate`.

### 3. Operational Detail Layers
- **Notes Division**: Clear separation of internal-only `internalNotes` and client-facing `customerNotes` to protect internal shop communication.
- **Material & Labor tracking**: `materialUsage` records quantities, units, and unit costs. `timeEntries` tracks operator time logs.
- **Billing Drafts**: `invoiceDraft` houses line items, status (`none` | `draft` | `issued` | `paid`), invoice number, and payments.
- **Attachments**: `attachments` hosts metadata for files, designs, and order photos.
- **Public Communication**: `communication` contains public tracking tokens, enabling secure external status pages without user authentication.

## Commands

### Desktop Client (`apps/desktop/`)
```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

### Web Client (`apps/web/`)
```bash
npm install
npm run dev
npm run typecheck
npm run test
```

### Backend API (`iris-api/`)
```bash
go run ./cmd/server
go test ./...
```

## Docs Map

- `docs/ARCHITECTURE.md`: High-level multi-application structure, runtime layers, IPC-HTTP boundaries, and data flow.
- `docs/DECISIONS.md`: Architectural decisions, status definitions, and schema alignments.
- `docs/DOMAIN_GLOSSARY.md`: Glossary of print-shop terms mapped between Serbian UI labels and English code.
- `docs/CONTRIBUTING.md`: Workflow guidelines and testing rules.
- `docs/WEB_FUTURE_FEATURES.md`: Production checklist and future functional additions.

*Last verified against the checked-in repository state on 2026-05-31.*
