# Iris Operations Management Suite

Iris is the operations workspace for Stamparija Cobanovic. The repository is a
monorepo with an Electron desktop client, a React web client, and a shared Go
backend API.

## Monorepo Topology

```text
.
├── apps/
│   ├── desktop/                Electron desktop app for local shop operations
│   └── web/                    Vite React app for browser operations and public tracking
├── iris-api/                   Go HTTP API and SQLite persistence layer
└── docs/                       Architecture, decisions, glossary, and contribution policy
```

- [apps/desktop](apps/desktop/): Electron 39, React 19, Tailwind CSS 4. Renderer
  calls pass through a typed preload bridge to main-process IPC handlers, then to
  the Go API through `IrisApiClient`.
- [apps/web](apps/web/): Vite React client with `http` and `fixtures` runtime
  modes behind the same `window.api` contract.
- [iris-api](iris-api/): Go REST API built with `chi`, documented in
  `openapi.yaml`, backed by SQLite in local and Docker runtimes.

## Development Commands

Backend API:

```bash
cd iris-api
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
DATABASE_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server
```

Docker backend:

```bash
docker compose up -d --build
docker compose logs -f iris-api
docker compose down
```

Compose persists SQLite at `/data/iris.db` through the named volume
`iris_sqlite_data`. Do not run `docker compose down -v` unless you intentionally
want to delete that database volume.

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

## Documentation Index

- [Architecture Overview](docs/ARCHITECTURE.md): system topology, runtime
  boundaries, and request flows.
- [Project Context](docs/PROJECT_CONTEXT.md): compact repository map and domain
  model snapshot.
- [Decisions Register](docs/DECISIONS.md): accepted and temporary architectural
  decisions.
- [Domain Glossary](docs/DOMAIN_GLOSSARY.md): Serbian UI vocabulary mapped to
  English code and API tokens.
- [Contributing Guide](docs/CONTRIBUTING.md): development rules, verification
  commands, and commit expectations.
- [API README](iris-api/README.md): backend configuration, CLI operations, and
  endpoint reference.

## AI Contributor Assets

Specialized Copilot and agent profiles live under `.github/`:

- [.github/copilot-instructions.md](.github/copilot-instructions.md)
- [.github/agents/react-frontend-agent.agent.md](.github/agents/react-frontend-agent.agent.md)
- [.github/agents/go-backend-agent.agent.md](.github/agents/go-backend-agent.agent.md)
- [.github/agents/electron-code-review-mode.md](.github/agents/electron-code-review-mode.md)

*Last verified against the checked-in repository state on 2026-06-01.*
