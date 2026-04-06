# Iris Desktop

Electron desktop application built with React and TypeScript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Type Checking

```bash
npm run typecheck
```

## Tests

```bash
npm test
```

## Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Fixtures

Development fixture data for login and work orders lives in:

- `fixtures/users.json`
- `fixtures/work-orders.json`

The Electron main process reads those files to provide local mock data during development.
