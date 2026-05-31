# Iris Operations Management Suite

Iris is a high-performance, full-stack operations management suite built specifically for **Stamparija Cobanovic** (print-shop operations). The repository is organized as a monorepo consisting of native desktop client interfaces, a web operational client, and a shared Go backend API.

---

## Monorepo Topology

```text
.
├── apps/
│   ├── desktop/                Electron desktop app for local shop floor operations
│   └── web/                    Vite-powered React web app for remote managers and customer portals
├── iris-api/                   Shared Go HTTP API server (single source of truth)
└── docs/                       Project specifications, decisions, and domain glossaries
```

- **[apps/desktop](file:///Users/luka/Projects/iris/apps/desktop/)**: A secure native desktop shell built with Electron 39, React 19, and Tailwind CSS 4. Operates by mapping local IPC commands in the renderer to a typed `IrisApiClient` in the main process, communicating securely over HTTP with the Go backend API.
- **[apps/web](file:///Users/luka/Projects/iris/apps/web/)**: A lightweight, responsive React web client using a dual-mode API runtime configuration. It can connect directly to `iris-api` over fetch operations (`http` mode) or execute within a persistent stateful client sandbox completely inside browser memory (`fixtures` mode).
- **[iris-api](file:///Users/luka/Projects/iris/iris-api/)**: High-performance Go REST API built with Chi router, executing against the contract defined in `openapi.yaml`. Uses a thread-safe, fixture-backed memory store loaded from seed JSON files during startup.

---

## Quick Start

### 1. Launch Backend API
Ensure Go 1.22+ is installed:
```bash
cd iris-api
go run ./cmd/server
```
*API runs at `http://localhost:8080`.*

### 2. Launch Web Client
```bash
cd apps/web
npm install
npm run dev
```

### 3. Launch Desktop Client
```bash
cd apps/desktop
npm install
npm run dev
```

For thorough command listings, testing guidelines, and repository contribution policies, consult the **[Contributing Guide](file:///Users/luka/Projects/iris/docs/CONTRIBUTING.md)**.

---

## AI Assets for Contributors

This repository includes specialized GitHub Copilot and AI agent profiles under `.github/` to accelerate common development activities:

### Shared Baseline Instructions
- **[copilot-instructions.md](file:///Users/luka/Projects/iris/.github/copilot-instructions.md)**: Universal repository principles, domain glossary alignments, and monorepo code conventions. Use this as your baseline instructions.

### Specialized AI Agent Handbooks
- **[react-frontend-agent.agent.md](file:///Users/luka/Projects/iris/.github/agents/react-frontend-agent.agent.md)**: Optimized for React UI updates, Tailwind v4 layouts, forms, and client-side page aggregates in `apps/web` or `apps/desktop/src/renderer/`.
- **[go-backend-agent.agent.md](file:///Users/luka/Projects/iris/.github/agents/go-backend-agent.agent.md)**: Crafted for editing OpenAPI contracts, writing new Chi endpoints, testing router layers, or maintaining mock stores in `iris-api`.
- **[electron-code-review-mode.md](file:///Users/luka/Projects/iris/.github/agents/electron-code-review-mode.md)**: Tailored for validating sandboxing boundaries, context bridge security, and type safety across Electron main, preload, and renderer boundaries.

---

## Documentation Index

Explore our extensive documentation folder for architectural context:
- 🗺️ **[Architecture Overview](file:///Users/luka/Projects/iris/docs/ARCHITECTURE.md)**: Topology drawings, system interfaces, and end-to-end network flows.
- 🎯 **[Project Context](file:///Users/luka/Projects/iris/docs/PROJECT_CONTEXT.md)**: Expanded domain models, structure definitions, and unified print lifecycle.
- 📋 **[Decisions Register](file:///Users/luka/Projects/iris/docs/DECISIONS.md)**: History of architectural boundaries, storage choices, and runtime scopes.
- 📖 **[Domain Glossary](file:///Users/luka/Projects/iris/docs/DOMAIN_GLOSSARY.md)**: Comprehensive vocabulary mapping Serbian interface text (`sr-Latn`) to backend English entities.

*Last verified against the checked-in repository state on 2026-05-31.*
