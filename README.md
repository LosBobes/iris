# Iris

Full-stack application for Stamparija Cobanovic.

## Workspace

This repository currently contains:

- `apps/desktop`: the Electron desktop application built with React and TypeScript
- `iris-api`: a Go HTTP API that mirrors the data needs of the desktop app

## Purpose

The desktop application currently focuses on:

- user authentication
- work order browsing and dashboard reporting
- operator-based work order analysis

The API module is now the source of truth for those same capabilities, and the desktop app reaches it through Electron main-process IPC handlers.

## AI Assets for Contributors

This repository includes specialized GitHub Copilot assets under `.github/` to help with common kinds of work.

### Shared baseline instructions

- **`.github/copilot-instructions.md`**
  Repository-wide coding rules, architecture guidance, and conventions.
  Use this as the default baseline for all tasks.

### Custom agents

- **`.github/agents/react-frontend-agent.agent.md`**
  Use for new React UI features, component work, forms, routing, and renderer-layer improvements.

- **`.github/agents/go-backend-agent.agent.md`**
  Use for OpenAPI changes, chi handlers, fixture-store behavior, and Go tests in `iris-api`.

- **`.github/agents/electron-code-review-mode.md`**
  Use for code reviews across the Electron stack — main process IPC handlers, preload bridge, and renderer.

### How to choose

| Task | Agent |
|------|-------|
| Building or modifying React UI components, forms, or pages | `react-frontend-agent` |
| Changing Go routes, OpenAPI, fixture-backed API behavior, or backend tests | `go-backend-agent` |
| Reviewing code across any Electron layer | `electron-code-review-mode` |
| Unsure? | Start with the shared baseline in `.github/copilot-instructions.md`, then pick the agent whose mission best matches the task |

### Recommended workflow

1. Read the shared baseline in `.github/copilot-instructions.md`.
2. Choose the matching agent in `.github/agents/`.
3. Follow the normal repo workflow: inspect docs first, update tests, and run the relevant commands from `apps/desktop/` or `iris-api/` depending on the slice you changed.
