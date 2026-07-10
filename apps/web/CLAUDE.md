# Iris Web — frontend guidance

Scope: everything under `apps/web/`. Vite 8 + React 19 + TypeScript ~6 +
Tailwind v4 browser client. Start with [README.md](README.md).

## Runtime modes

`src/lib/web-api.ts` installs the same `window.api` shape the desktop renderer
uses, so feature code stays transport-agnostic:

- `VITE_IRIS_API_MODE=http` → `src/lib/api-client.ts` → `fetch` with
  `credentials: 'include'` against `iris-api`.
- `VITE_IRIS_API_MODE=fixtures` (dev only) → in-memory stateful store seeded from
  `src/fixtures/`.

Source app data through `window.api.*` (or the hooks that wrap it). Don't scatter
raw `fetch()` calls through components — the transport choice lives in
`src/lib/`. Env config: `.env.example`, `.env.development` (checked-in dev
defaults); production values come from server-local `.env.production` or shell
vars and must not be committed.

## Architecture & conventions

- Feature-based folders under `src/components/<Feature>/`; shadcn primitives in
  `src/components/ui/` — reuse before adding new ones.
- Data hooks in `src/hooks/` (`useAuth`, `useWorkOrders`, `useDashboardData`).
  Separate data fetching (hooks) from presentation (components).
- Pages/routes in `src/pages/` (incl. `PublicWorkOrderPage`, `CustomersPage`);
  routing via `react-router-dom`.
- Domain types in `src/types/work-order.ts` — a contract-sync point with
  `iris-api/openapi.yaml` and `apps/desktop/model/`. See the contract-sync rule in
  the root [CLAUDE.md](../../CLAUDE.md).
- Shop-wide **organization settings** (`src/types/settings.ts`) flow through
  `src/contexts/OrganizationContext.ts` (firm name, PDF sections, billing/priority
  defaults, shipping-options toggle). Gate dependent form fields/columns/filters on
  them — use the `add-settings-flag` skill.
- The work-order form takes a per-order **edit lock** via `useWorkOrderEditLock`
  (heartbeat every 30 s, fails open; form goes read-only only when another operator
  holds it). Login requires an **organization slug** alongside username + password.
- Dashboard analytics: clients fetch raw work orders and aggregate client-side in
  `src/lib/dashboard/aggregations.ts` (pure, unit-tested) — not computed on the
  server.
- Forms: `react-hook-form` + `zod` (`src/lib/work-orders/validation.ts`).
- Visible UI text and messages in Serbian (`sr-Latn`); code/tests in English.
- Dates: `YYYY-MM-DD` stored, `DD.MM.YYYY` displayed (`src/lib/i18n-date.ts`).

## Testing

- Vitest; tests colocated as `*.test.ts(x)`.
- Stub the API surface with `vi.stubGlobal('api', { method: vi.fn() })`.
- Tests written in English.

## Commands

```bash
npm install && npm run dev    # :5173
npm run lint && npm test && npm run build
npm run preview               # preview production build
```

## Pitfalls

- Authorization gating here is UI-only (`role === 'admin'`) — not a security
  boundary; the API enforces it.
- `apps/web` and `apps/desktop/src/renderer` duplicate components/hooks/dashboard
  libs; a shared change often needs the matching desktop edit too.
