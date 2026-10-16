# Iris Web

Browser client for Iris operations, dashboard reporting, customer management,
work-order handling, and public tracking.

## Runtime Modes

`src/lib/web-api.ts` installs the `window.api` shape feature code calls, so the
transport stays swappable.

- `VITE_IRIS_API_MODE=http`: calls `iris-api` through `src/lib/api-client.ts`.
- `VITE_IRIS_API_MODE=fixtures`: runs against a stateful in-browser fixture
  adapter seeded from `src/fixtures`.

Default development configuration lives in `.env.development`.

Production web builds read Vite environment variables at build time. Use a
server-local `apps/web/.env.production` or shell variables for production, and
do not commit files that contain real hostnames or secrets.

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

- organization: `demo`
- username: `admin`
- password: `admin123`

## Installable app (PWA)

Production builds are installable on Android, iOS/iPadOS and desktop:

- `public/manifest.webmanifest` + `public/icons/` drive Android/Chromium
  install (standalone window, maskable icon, shortcuts). iOS Safari uses the
  `apple-*` tags and `public/apple-touch-icon.png` in `index.html` instead.
- `pwa/vite-plugin.ts` emits `/sw.js` from `pwa/service-worker.js` on every
  build, precaching the hashed bundle so the installed app opens instantly and
  survives a dropped connection. Navigations are network-first (cached shell is
  only an offline fallback); **API responses are never cached** — they are
  tenant/session scoped. The worker is not registered by the dev server.
- Settings → "Aplikacija na uređaju" offers a one-tap install on Chromium and
  Share → "Dodaj na početni ekran" instructions on iOS (Safari has no install
  prompt API).
- Icons are generated from the brand mark: `node scripts/generate-pwa-icons.mjs`
  (set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright's bundled browser is missing).
- Service workers need HTTPS (or `localhost`); `npm run build && npm run preview`
  is the way to try it locally. `frontend/nginx.conf` serves `sw.js` and the
  manifest with `Cache-Control: no-cache` so deploys reach installed apps.

## Verification

```bash
npm run lint
npm run build
npm test
```
