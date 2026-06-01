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

Production web builds read Vite environment variables at build time. Use a
server-local `apps/web/.env.production` or shell variables for production, and
do not commit files that contain real hostnames or secrets. See
[`../../docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) for Docker and Hetzner
deployment notes.

Same-origin production example:

```bash
VITE_IRIS_API_MODE=http
VITE_IRIS_API_BASE_URL=https://iris.example.com
```

Split-origin production example:

```bash
VITE_IRIS_API_MODE=http
VITE_IRIS_API_BASE_URL=https://api.example.com
```

## Local Commands

```bash
npm install
npm run dev
npm run build
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
