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
- **Client cache:** TanStack Query (`src/lib/query-client.ts`, provider in
  `main.tsx`). Work-order list/detail, enum values, catalog items and settings
  are queries (30 s stale for lists, 5 min for reference data). Successful
  `window.api` mutations invalidate the affected roots automatically via
  `withQueryInvalidation` — register a new mutating method in its
  `INVALIDATIONS` map. The cache is cleared on login/logout/session expiry
  (tenant-scoped data), and those session changes (plus impersonation start)
  are broadcast to the other tabs (`lib/auth-broadcast.ts`, `iris-auth`
  BroadcastChannel or a `storage` event), which clear their cache and re-check
  the session. The work-order detail query always refetches on mount (cached
  copy shown meanwhile). Tests: `src/test/query.tsx`
  (`renderWithQueryClient`, `renderHookWithQueryClient`).
- **Work-order list** is filtered, sorted and paged by the API (`GET /work-orders`,
  default 50 / max 200 per page; `GET /work-orders/export.csv` for the export).
  `src/lib/work-orders/list-query.ts` is the fixture-mode twin of the Go query
  (`iris-api/internal/store/work_order_list.go`) — keep them in sync.
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
- **Prisustvo** (D-027, module `attendance`, no requirements): `/attendance` page
  (`pages/AttendancePage.tsx`, `components/attendance/`), nav "Prisustvo" for everyone, hook
  `hooks/useAttendance.ts`, keys `attendanceKeys` (root `['attendance']`). Fixture mode keeps it in the
  planning fixture store (the planner reads its overrides) behind `ATTENDANCE_DISABLED_MESSAGE`.
- **Planiranje** (D-026, third module `planning`, requires `processes` and `attendance`): contract types in
  `src/types/planning.ts`; `window.api` methods `listMachineTypes` … `getPlanningForecast`; query keys in
  `src/lib/planning/query-keys.ts` (all under `['planning']`, invalidations in `query-client.ts`). Fixture mode:
  `src/lib/planning/fixture-store.ts` (seeded machines, in-memory plans, 403 `PLANNING_DISABLED_MESSAGE` when off) on
  top of `fixture-planner.ts`, a pure TS twin of `iris-api/internal/planner` (keep rules in sync). Nav "Planiranje"
  (admins) and "Moj red" (everyone) and the step fields in the process inspector (machine type, crew, times) show
  only while `useOrganization().modules.planning` is on; the Backoffice template editor never shows them.
  The printable dispatch list ("Štampaj raspored", D-028) is `/planning/print?date=&to=&by=machine|person&source=`
  (`pages/PlanningPrintPage.tsx`, rendered outside the app shell; grouping in pure `lib/planning/dispatch.ts`,
  sheets in `components/planning/DispatchList.tsx`, print rules `dispatch-print-*` in `main.css`).
- **Landing page** (`/home`, public, outside the auth gate next to the public tracking route):
  `pages/HomePage.tsx` composes `components/home/` (the hero's live work order, status explorer,
  price example, module playground, role switcher, FAQ, scroll spy) over pure helpers in
  `lib/home/` (`pricing.ts`, `modules.ts` mirror the app's VAT and module-dependency rules; keep
  them in step). Long-form Serbian only (no i18n keys), no API calls. Its call to action goes to
  the sign-in (or into the app when `signedIn`); the contact address has a built-in default,
  overridable with `VITE_HOME_CONTACT_EMAIL`. When a feature new clients should hear about ships,
  add it there too.
- **Dokumentacija** (`/docs`, `/docs/:chapterId`, nav for everyone): `pages/DocsPage.tsx` over
  `components/docs/` — chapters in `chapters.tsx` (long-form Serbian only; just the page chrome is in
  i18n), inline SVG diagrams in `diagrams.tsx` built from `diagram-kit.tsx` (theme CSS variables, no
  palette of their own), searchable `Glossary.tsx`. When a feature changes behavior users see, update its
  chapter, diagram and glossary entry in the same PR.
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
