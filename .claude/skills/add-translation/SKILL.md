---
name: add-translation
description: Add or translate user-facing strings in the Iris web app using react-i18next (Serbian default, English alternate). Use when introducing new UI text, translating a not-yet-migrated component/page, or adding keys to the sr/en bundles.
---

# Add translations (Iris web, react-i18next)

Visible UI text is localized with **react-i18next**. Serbian (`sr`, the default)
is the source of truth; English (`en`) is typed against it so a missing key is a
compile error. Never hardcode user-facing Serbian/English in components — route
it through `t(...)`.

## Where things live

- `apps/web/src/i18n/index.ts` — i18next init (sr default, localStorage detector).
- `apps/web/src/i18n/locales/sr.ts` — **source of truth**, plain nested object.
- `apps/web/src/i18n/locales/en.ts` — `export const en: typeof sr = { ... }`
  (must mirror `sr` exactly; missing/renamed keys fail `tsc`).
- Language toggle: a "Jezik / Language" card on the Settings page
  (`apps/web/src/pages/SettingsPage.tsx`), persisted to `localStorage`.

Keys are grouped by feature: `common`, `nav`, `shell`, `auth`, `app`, `settings`,
`workOrders` (with `status`/`billing`/`delivery`/`priority`/`unit`/`lineKind`/
`list`/`detail`/`form`/`summary`/`toast`/`notice`/`customerNextSteps`),
`customers`, `customerDetail`, `catalog`, `users`, `pager`.

## 1. Add the keys to both bundles

Add to `sr.ts` first, then the matching key to `en.ts`. Reuse existing keys
(`common.*`, `shell.*`, `workOrders.notice.*`, etc.) instead of duplicating.

```ts
// sr.ts
catalog: { /* ... */ newItem: 'Nova stavka' }
// en.ts
catalog: { /* ... */ newItem: 'New item' }
```

Interpolation uses `{{name}}` placeholders: `t('users.deleteAria', { name })`.
Counters: pass `{ count }` and write the value into the string.

## 2. Use it in components

```tsx
import { useTranslation } from "react-i18next";
function MyComponent() {
  const { t } = useTranslation();
  return <button aria-label={t("common.delete")}>{t("catalog.newItem")}</button>;
}
```

- Add the hook to **every** component that renders text (sub-components too).
- When `t` is used inside a `useCallback`/`useEffect`, add `t` to the dependency
  array (it is stable) to satisfy `react-hooks/exhaustive-deps`.
- Move module-level label arrays/maps (e.g. tab defs) **into** the component so
  they can call `t`, or back them with the i18n singleton (next section).

## 3. Enum/label maps and non-component utilities

Shared label maps and helpers used outside React (CSV export, search haystacks,
clipboard notices) read the i18n singleton directly so they reflect the active
language at call time:

```ts
import i18n from "@/i18n";
export function getWorkOrderStatusLabel(status: WorkOrderStatus): string {
  return i18n.t(`workOrders.status.${status}`);
}
```

Components that render these re-render on language change via their own
`useTranslation()`. Examples already converted: `shared/utils/work-orders.ts`
(status/billing/delivery/priority/postage/customer-next-steps),
`lib/catalog.ts` (`kindLabel`, `costPriceLabel`).

i18n initializes **synchronously** with inline resources, so these getters return
the Serbian default inside the node test environment — existing unit tests that
assert Serbian strings keep passing. Do not assert raw key strings in tests.

## 4. Validate (from `apps/web/`)

```bash
npm run build   # tsc: catches en/sr key drift
npm run lint    # catches missing t deps / unused imports
npm test        # logic tests (sr default keeps label assertions valid)
```

## 5. Conventions

- Serbian is the default and the key source of truth; keep `en.ts` shaped as
  `typeof sr`.
- Commit per surface (e.g. `i18n(web): translate the Users page`) so the diff
  stays reviewable.
- The desktop renderer (`apps/desktop/src/renderer`) duplicates many components
  and is a **separate** i18n effort — it needs its own react-i18next setup
  mirrored before its strings can be migrated; call that out rather than assuming
  a web change covers it.
