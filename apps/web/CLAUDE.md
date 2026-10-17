# Iris Web — frontend guidance

Scope: everything under `apps/web/`. Vite 8 + React 19 + TypeScript ~6 +
Tailwind v4 browser client. Start with [README.md](README.md).

## Runtime modes

`src/lib/web-api.ts` installs the `window.api` shape feature code calls, so it
stays transport-agnostic:

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
  `iris-api/openapi.yaml`. See the contract-sync rule in the root
  [CLAUDE.md](../../CLAUDE.md).
- Shop-wide **organization settings** (`src/types/settings.ts`) flow through
  `src/contexts/OrganizationContext.ts` (firm name, PDF sections, billing/priority
  defaults, shipping-options toggle). Gate dependent form fields/columns/filters on
  them — use the `add-settings-flag` skill.
- The work-order form takes a per-order **edit lock** via `useWorkOrderEditLock`
  (heartbeat every 30 s, fails open; form goes read-only only when another operator
  holds it). Login requires an **organization slug** alongside username + password.
- Dashboard analytics are computed server-side by `GET /dashboard`
  (`iris-api/internal/dashboard`); `useDashboardData` calls
  `window.api.getDashboard`. `src/lib/dashboard/` (`aggregations.ts`, `profit.ts`,
  `build.ts`) is the TypeScript reference implementation that fixture mode serves —
  keep it behaviorally identical to the Go port when changing either. Shapes live in
  `src/types/dashboard.ts` (contract-sync with the `Dashboard*` OpenAPI schemas).
- **Magacin (warehouse stock)**: `src/types/stock.ts` (contract-sync with the `Stock*`
  schemas), pages `StockPage` (`/stock`) and `StockHistoryPage` (`/stock/:catalogItemId`).
  Posting math lives in pure `src/lib/stock/posting.ts`; fixture mode keeps a real ledger
  (`src/lib/stock/fixture-store.ts`) that posts automatically when a work-order process is
  saved. Process item nodes link to catalog articles (`catalogItemId`); backoffice template
  editing (platform session) skips linking and live stock.
- **Optional modules** (`OrganizationModules`, both off by default, switched only by Backoffice
  superadmins via `setPlatformTenantModules`; "Procesi rada" requires "Magacin"):
  read `modules.processes` / `modules.stock` from `useOrganization()` (effective values, defaults
  off). Disabled routes render `ModuleGate` ("Modul nije uključen"); never fire requests to a
  disabled module's endpoints (the API answers 403). Fixture mode: `createFixtureApi({ modules })`
  or Backoffice (`/backoffice`, operater / operater-demo) → Organizacije → Moduli. Tests use
  `src/test/modules.tsx` (`WithModules`).
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
