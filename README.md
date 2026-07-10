# Iris Operations Management Suite

Iris is a full-stack operations workspace for **Stamparija Cobanovic**, a print-shop environment. It covers the complete work-order lifecycle — from intake through invoicing — alongside customer master data, dashboard analytics, and a public order-tracking portal for customers.

The repository is a **monorepo** comprising three deployable surfaces that share one Go REST API and one SQLite database. The system is **multi-tenant**: all data is isolated per organization ("tenant"), and users sign in with an organization slug alongside their username and password.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Backend API](#backend-api)
  - [Web Client](#web-client)
  - [Desktop Client](#desktop-client)
  - [Docker (production-like)](#docker-production-like)
- [Usage](#usage)
  - [Running the Backend API](#running-the-backend-api)
  - [Running the Web Client](#running-the-web-client)
  - [Running the Desktop Client](#running-the-desktop-client)
  - [CLI Administration](#cli-administration)
- [Project Structure](#project-structure)
- [Configuration Reference](#configuration-reference)
- [Testing](#testing)
- [Documentation Index](#documentation-index)

---

## Project Overview

Iris manages the day-to-day operations of a commercial print shop:

| Domain | Capabilities |
|--------|-------------|
| **Work Orders** | Full lifecycle management (`new → assigned → inProgress → completed → invoiced`), operator assignment, priority, materials, time entries, notes, invoice drafts, PDF rendering, order-number reservation, and a per-order edit lock |
| **Customers & Locations** | Normalized master data with location sub-entities |
| **Dashboard** | Revenue charts, status aggregations, queue summaries |
| **Public Tracking** | Token-based, unauthenticated status lookup for customers |
| **Organization Settings** | Admin-configurable, shop-wide defaults: firm name, PDF sections, billing/priority defaults, and a shipping-options toggle |
| **Multi-Tenancy** | Every record is scoped to an isolated tenant (organization); login requires the organization slug |
| **Admin Operations** | Tenant/user management, database migrations, CSV import, backup via the `irisctl` CLI |

### Architecture at a Glance

```
┌─────────────────────┐      ┌─────────────────────┐
│  apps/web           │      │  apps/desktop        │
│  Vite · React 19    │      │  Electron 39         │
│  TypeScript · TW 4  │      │  React 19 · TW 4     │
└────────┬────────────┘      └──────────┬───────────┘
         │  HTTP (fetch + cookie)        │  IPC → IrisApiClient
         └─────────────┬────────────────┘
                       ▼
             ┌─────────────────┐
             │   iris-api      │
             │  Go · chi       │
             │  SQLite         │
             └─────────────────┘
```

The web client and the desktop renderer share the same `window.api` call contract; the Electron main process translates IPC calls to HTTP. All API contracts are governed by `iris-api/openapi.yaml`.

---

## Prerequisites

| Dependency | Minimum Version | Purpose |
|-----------|----------------|---------|
| **Go** | 1.26 | Backend API and CLI |
| **Node.js** | 20 LTS | Web and desktop clients |
| **npm** | 10 | Package management |
| **Docker & Docker Compose** | 24 / v2 | Production-like deployment |
| **Git** | any | Version control |

No external database is required — the application ships with SQLite.

---

## Installation

### Backend API

```bash
cd iris-api

# Download Go module dependencies
go mod download
```

### Web Client

```bash
cd apps/web
npm install
```

### Desktop Client

Before installing, create a local environment file to configure the API endpoint:

```bash
# apps/desktop/.env
IRIS_API_BASE_URL=http://localhost:8080
```

Then install dependencies:

```bash
cd apps/desktop
npm install
```

### Docker (production-like)

No manual dependency installation is needed. The multi-stage `Dockerfile` compiles the Go binary and the web SPA, then packages both into a minimal distroless image served on port `8080`.

```bash
# Build and start in the background
docker compose up -d --build
```

> **Data persistence:** Docker Compose stores SQLite at `/data/iris.db` inside the named volume `iris_sqlite_data`. Never run `docker compose down -v` unless you intend to permanently delete all application data.

---

## Usage

### Running the Backend API

The backend requires a database migration before first use. All commands target a local SQLite file via `DATABASE_PATH`.

```bash
cd iris-api

# 1. Create the schema
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate

# 2. (Optional) Seed with representative demo data
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo

# 3. Start the API server (listens on :8080)
DATABASE_PATH=./data/iris.db \
  IRIS_SESSION_SECRET=dev-secret-change-me \
  go run ./cmd/server
```

Verify the server is healthy:

```bash
curl http://localhost:8080/healthz
# → {"status":"ok"}
```

Default demo credentials — organization **`demo`**, username **`admin`**, password **`admin123`** (`seed-demo` creates the `demo` tenant and this account).

---

### Running the Web Client

The web client operates in two modes controlled by `VITE_IRIS_API_MODE`:

| Mode | Behavior |
|------|---------|
| `http` (default) | Calls the running iris-api with session cookies |
| `fixtures` | Runs entirely in-browser from bundled seed data (no API required) |

```bash
cd apps/web

# Start in HTTP mode (requires iris-api on :8080)
npm run dev
# → http://localhost:5173

# Start in fixture mode (standalone, no backend)
VITE_IRIS_API_MODE=fixtures npm run dev
```

#### Logging in (HTTP mode)

Navigate to `http://localhost:5173`, enter organization `demo`, username `admin`, password `admin123`, and you will be directed to the dashboard. The organization slug is remembered in the browser for subsequent logins.

#### Public order tracking

Unauthenticated customers can look up their order status at:

```
http://localhost:5173/track/{public-token}
```

---

### Running the Desktop Client

The desktop client is an Electron application pointing at the same Go API.

```bash
cd apps/desktop

# Start the Electron app in development mode
npm run dev
```

To build a distributable package:

```bash
# macOS (produces a .dmg and .app inside out/)
npm run build:mac

# Windows
npm run build:win
```

---

### Using Docker Helper Scripts

```bash
# Build, start, wait for /healthz, then seed demo data in one step
scripts/docker-up.sh --seed

# Verify SQLite data survives an image rebuild and docker system prune
# (machine-wide prune; use PRUNE_SCOPE=image to limit scope)
scripts/docker-persistence-test.sh
```

---

### CLI Administration

`irisctl` is the administrative CLI bundled with the backend. It provides low-level database and user operations without requiring the HTTP server to be running.

```bash
cd iris-api

# Run all pending schema migrations
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate

# Populate the database with representative demo data (creates the `demo` tenant)
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo

# Create a new tenant (organization), optionally with a first admin user
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl create-tenant \
  -slug grafika-cobanovic -name "Grafika Čobanović" \
  -admin-username admin -admin-password '<secret>'

# Create a user within a tenant (the -tenant slug is required)
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl create-user \
  -tenant grafika-cobanovic -username ops1 -password '<secret>' -role user

# Import customer/work-order data from a CSV directory (`--apply` requires -tenant)
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-csv --dry-run --dir ./imports
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl import-csv --apply -tenant grafika-cobanovic --dir ./imports

# Back up the SQLite database file
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl backup -out ./backups/iris.db
```

---

## Project Structure

```
iris/
├── apps/
│   ├── desktop/                    # Electron desktop client
│   │   ├── config/                 #   API URL defaults (dev vs prod)
│   │   ├── model/                  #   TypeScript domain types
│   │   └── src/
│   │       ├── main/               #   Main process: IPC handlers, IrisApiClient
│   │       ├── preload/            #   window.api typed bridge
│   │       └── renderer/src/       #   React UI (pages, hooks, dashboard)
│   │
│   └── web/                        # Vite browser client
│       └── src/
│           ├── components/         #   Reusable UI widgets and forms
│           ├── fixtures/           #   In-memory fixture data for fixture mode
│           ├── hooks/              #   useAuth, useWorkOrders, useDashboardData
│           ├── lib/                #   API client, fixture-api, dashboard logic
│           ├── pages/              #   Dashboard, customers, work orders, tracking
│           └── types/              #   TypeScript domain types
│
├── iris-api/                       # Go REST API
│   ├── cmd/
│   │   ├── server/                 #   HTTP server entry point
│   │   └── irisctl/                #   Admin CLI (migrate, seed, create-tenant, users, backup)
│   ├── internal/
│   │   ├── api/                    #   chi routes, middleware, handlers, tests
│   │   ├── domain/                 #   Go request/response structs (OpenAPI contract)
│   │   ├── store/                  #   Store interface + SQLite implementation
│   │   ├── reports/                #   PDF rendering via chromedp
│   │   └── testutil/               #   Shared test helpers and fixture builders
│   ├── testdata/fixtures/          #   JSON fixtures for tests and seed-demo
│   └── openapi.yaml                #   HTTP contract (source of truth for all clients)
│
├── docs/                           # Architecture and contributor documentation
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── DOMAIN_GLOSSARY.md          #   Serbian UI ↔ English code term mapping
│   ├── CONTRIBUTING.md
│   ├── PROJECT_CONTEXT.md
│   └── deployment-hetzner.md       #   Hetzner shared-host deployment guide
│
├── .github/
│   ├── copilot-instructions.md     # AI contributor guidance
│   └── agents/                     # Domain-specific agent profiles
│
├── scripts/
│   ├── docker-up.sh
│   └── docker-persistence-test.sh
│
├── Dockerfile                      # Multi-stage: Go + web → distroless
└── docker-compose.yml              # Local API + named SQLite volume
```

**Key contract point:** `iris-api/openapi.yaml` is the single source of truth for the HTTP API. Go domain types, TypeScript types, test fixtures, and the seed-demo JSON must all remain aligned with it. Any domain change requires updates in all four locations.

---

## Configuration Reference

### Backend (`iris-api`)

| Variable | Description | Default |
|----------|------------|---------|
| `DATABASE_PATH` | SQLite database file path | `./data/iris.db` |
| `IRIS_SESSION_SECRET` | Session signing secret (required in production) | — |
| `IRIS_API_ADDR` | Listen address | `:8080` |
| `IRIS_ENV` | Runtime environment (`development` or `production`) | `development` |
| `IRIS_ALLOWED_ORIGINS` | CORS origin allowlist | Local dev origins |
| `IRIS_WEB_DIR` | Directory to serve as a static SPA | — |

### Web Client (`apps/web`)

| Variable | Description | Default |
|----------|------------|---------|
| `VITE_IRIS_API_MODE` | `http` or `fixtures` | see `.env.development` |
| `VITE_IRIS_API_BASE_URL` | API origin | `http://localhost:8080` |

### Desktop Client (`apps/desktop`)

| Variable | Description |
|----------|------------|
| `IRIS_API_BASE_URL` | API base URL (set in `.env` or `config/development.ts`) |

---

## Testing

Each package has its own test suite. Run them independently or together:

```bash
# Go API tests (unit + integration, 46 tests)
cd iris-api
go test ./...

# Web client tests (Vitest, 35 tests)
cd apps/web
npm test

# Desktop client tests (Vitest, 54 tests)
cd apps/desktop
npm test
```

Type-checking (TypeScript strict mode):

```bash
cd apps/web && npx tsc --noEmit
cd apps/desktop && npx tsc --noEmit
```

---

## Documentation Index

| Document | Contents |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System topology, runtime boundaries, and request flows |
| [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | Compact repository map and domain model snapshot |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Accepted and temporary architectural decisions |
| [docs/DOMAIN_GLOSSARY.md](docs/DOMAIN_GLOSSARY.md) | Serbian UI vocabulary mapped to English code and API tokens |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Development rules, verification commands, and commit expectations |
| [docs/deployment-hetzner.md](docs/deployment-hetzner.md) | Hetzner shared-host production deployment guide |
| [iris-api/README.md](iris-api/README.md) | Backend configuration, CLI reference, and endpoint index |
| [apps/web/README.md](apps/web/README.md) | Web client runtime modes and build instructions |
| [apps/desktop/README.md](apps/desktop/README.md) | Electron setup, data flow, and packaging |

### AI Contributor Profiles

Specialized Copilot and agent profiles live under `.github/`:

- [.github/copilot-instructions.md](.github/copilot-instructions.md) — general contributor guidance
- [.github/agents/react-frontend-agent.agent.md](.github/agents/react-frontend-agent.agent.md)
- [.github/agents/go-backend-agent.agent.md](.github/agents/go-backend-agent.agent.md)
- [.github/agents/electron-code-review-mode.md](.github/agents/electron-code-review-mode.md)

---

*Last verified against repository state on 2026-07-10.*
