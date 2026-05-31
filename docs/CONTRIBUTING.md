# Contributing to Iris

This repository contains **Iris**, a full-stack operations management suite for Stamparija Cobanovic. It is structured as a monorepo containing multiple frontend clients and a shared Go backend service.

Use this guide together with:
- [PROJECT_CONTEXT.md](file:///Users/luka/Projects/iris/docs/PROJECT_CONTEXT.md)
- [ARCHITECTURE.md](file:///Users/luka/Projects/iris/docs/ARCHITECTURE.md)
- [DOMAIN_GLOSSARY.md](file:///Users/luka/Projects/iris/docs/DOMAIN_GLOSSARY.md)
- [DECISIONS.md](file:///Users/luka/Projects/iris/docs/DECISIONS.md)

---

## Monorepo Structure & Scope

The active codebase is divided into three key services:

1. **Desktop Client (`apps/desktop/`)**: Secure, containerized Electron desktop app for local shop operations.
2. **Web Client (`apps/web/`)**: React web application for browser-based operations, dashboard reporting, and remote tracking.
3. **Backend API (`iris-api/`)**: Pure Go HTTP REST service providing the single source of truth for authentication, CRM auto-completions, and work-order management.

---

## Prerequisites

- **Node.js** (v18+) and **npm** for frontends.
- **Go** (v1.22+) for backend API.
- A desktop environment capable of running Electron during local desktop development.

---

## Development Setup

To get the entire stack running locally:

### 1. Start the Shared Go Backend
```bash
cd iris-api
go run ./cmd/server
```
*The API boots on `http://localhost:8080` (unless configured otherwise via `IRIS_API_ADDR`). It operates out of an in-memory store seeded from JSON fixtures.*

### 2. Start the Desktop Client
```bash
cd apps/desktop
npm install
npm run dev
```
*The desktop app runs in development mode, automatically forwarding privileged Electron renderer actions via standard IPC handlers to the typed `IrisApiClient` which hits the Go REST backend.*

### 3. Start the Web Client
```bash
cd apps/web
npm install
npm run dev
```
*The web client runs on Vite. You can configure `VITE_IRIS_API_MODE` in environment config to switch between `http` mode (communicates directly with Go backend) and `fixtures` mode (runs statefully in browser memory sandbox).*

---

## Testing Boundaries

We maintain a rigorous multi-tiered testing strategy to ensure zero regressions across our runtime layers:

1. **Go API Integration Tests (`iris-api/`)**:
   Run with `go test ./...` to verify Chi routers, OpenAPI schema contracts, REST JSON serialization, and fixture seeding logic.
2. **Desktop Client Tests (`apps/desktop/`)**:
   Run with `npm run test` or `npx vitest run <path-to-test>`. Renderer tests run in `jsdom` with Vitest; preload boundaries and IPC handlers are verified using mock implementations.
3. **Web Client Tests (`apps/web/`)**:
   Run with `npm run test` to execute Vitest suites verifying dual-runtime clients, page state machines, filters, and CRM auto-completion panels.

---

## Development Workflow & Rules

### 1. Modifying the Domain Model
If you are modifying work-order fields, customer models, location structures, or billing logic:
- Update the OpenAPI contract in `iris-api/openapi.yaml`.
- Update the Go domain models in `iris-api/internal/domain/types.go`.
- Update the React models in both `apps/desktop/model/work-order.ts` and `apps/web/src/types/work-order.ts` to ensure consistency.

### 2. Adding Desktop IPC Channels
If you introduce a new native desktop capability:
- Register the main process IPC handler in `apps/desktop/src/main/index.ts` (mapping requests to the typed `IrisApiClient`).
- Expose the method on the context bridge in `apps/desktop/src/preload/index.ts`.
- Update TypeScript interface declarations in `apps/desktop/src/preload/index.d.ts` to keep the bridge strictly typed.

### 3. UI and Language Conventions
- **Visible UI text** must be in **Serbian (Latin script)** (`sr-Latn`) to suit print-shop operations.
- **Code identifiers, database columns, API JSON fields, and developer comments** must remain strictly in **English**.
- Refer to `docs/DOMAIN_GLOSSARY.md` for consistent mapping between Serbian UI terminology and English code tokens.

---

## Pull Requests And Commits

### Scope
Keep pull requests focused, narrow, and scoped to a single logical slice (e.g. adding a billing status, refactoring an API router, or adding unit tests).

### LORE-Style Commit Messages
We enforce LORE-style structured commit messages to build an informative development history. Every commit must have:
- An **intent-first subject line** (e.g. `feat: implement dual-mode http/fixture client for web`).
- An **optional explanatory body** describing *why* the change was made rather than *what* code changed.
- **Useful trailers** to communicate risk, testing status, and constraints:
  - `Tested: <test commands or manual confirmation details>`
  - `Not-tested: <reasons why testing was skipped, if applicable>`
  - `Constraint: <technological or project-level boundaries respected>`
  - `Scope-risk: <low | medium | high> <explanation>`

---

## When to Update Documentation
Always update relevant docs in the same PR when you:
- Add, rename, or retire backend API routes or desktop IPC channels.
- Shift any runtime boundaries or data flow pathways.
- Change domain models, statuses, or print-shop vocabulary.
- Graduate features from Phase 2 roadmaps to active service.

*Last verified against the checked-in repository state on 2026-05-31.*
