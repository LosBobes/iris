# Iris Web

Browser version of the Iris admin UI.

This app intentionally mirrors the Electron renderer in `apps/desktop/src/renderer/src`.
The React pages, layout, UI primitives, dashboard widgets, work-order table, and
work-order form were copied so the browser surface matches the desktop app.

## Local Development

```bash
npm install
npm run dev
```

The dev server runs through Vite. During local development the browser app uses
`src/lib/web-api.ts`, which exposes the same `window.api` shape as the Electron
preload bridge and serves data from `src/fixtures`.

Seeded login:

- username: `admin`
- password: `admin123`

## Verification

```bash
npm run lint
npm run build
```
