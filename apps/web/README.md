# Iris Web

Browser client for Iris operations, dashboard reporting, customer management,
work-order handling, and public tracking.

## Runtime Modes

`src/lib/web-api.ts` installs the same `window.api` shape used by the Electron
renderer.

- `VITE_IRIS_API_MODE=http`: calls `iris-api` through `src/lib/api-client.ts`.
- `VITE_IRIS_API_MODE=fixtures`: runs against a stateful in-browser fixture
  adapter seeded from `src/fixtures`.

Default development configuration lives in `.env.development`.

## Local Commands

```bash
npm install
npm run dev
```

Seeded demo login:

- username: `admin`
- password: `admin123`

## Verification

```bash
npm run lint
npm run build
npm test
```
