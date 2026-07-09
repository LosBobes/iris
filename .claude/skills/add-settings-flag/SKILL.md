---
name: add-settings-flag
description: Make a work-order (or other) field admin-configurable through shop-wide organization settings with a default value, then sweep the app for every UI component that depends on that field and gate it on the new setting. Use when a field should be hideable/overridable per shop (e.g. showShippingOptions, billingDefaults) and its dependent filters, columns, form fields, and printouts must react consistently.
---

# Add a settings-driven flag and sweep dependent UI

Iris settings live in the per-tenant SQLite `app_settings` key/value table and
flow to the web UI through `OrganizationContext`. Adding a configurable field is
two jobs that must both be done or the feature drifts:

1. **Plumb the setting** end to end (API domain/store/OpenAPI + web
   context/fixture-api + an admin Settings card), defaulting to a safe value.
2. **Sweep the app** for every UI surface that reads the underlying field and
   gate it on the new setting. Missing a dependent surface is the usual escape.

Settings are a **key/value JSON store**, so a new key needs **no DB migration** —
a missing row falls back to the coded default. This is different from the
`sync-domain-contract` skill (which is for persisted domain fields). Use that one
if you are adding the underlying field itself; use this one to make an existing
field configurable.

## Decide the shape first

- **Boolean toggle** (show/hide a block): model as `bool` + `DEFAULT_* = false`.
  Example: `showShippingOptions`.
- **Default value + override toggle** (pin a value, optionally let operators
  change it per record): model as a small struct `{ value; allowOverride bool }`.
  Example: `billingDefaults { documentType; allowOverride }`.

Pick the safe default (usually the **compact / hidden / pinned** state) so an
unconfigured shop gets the simpler form.

## 1. Plumb the setting (change together)

| # | File | What |
| - | --- | --- |
| 1 | `iris-api/openapi.yaml` | add the property to **both** `OrganizationSettings` and `OrganizationSettingsUpdate` schemas (+ `required` on the read schema) |
| 2 | `iris-api/internal/domain/types.go` | field on `OrganizationSettings`; **pointer** field on `OrganizationSettingsUpdate` (nil = "not provided"); a `DEFAULT_*` const/func |
| 3 | `iris-api/internal/store/settings_sqlite.go` | add a `*SettingKey` const; read it in `OrganizationSettings()` (add to the `IN (?, …)` list + a `case`); merge non-nil update in `UpdateOrganizationSettings()`; `upsertSetting(...)` it. Bools use `strconv.ParseBool`/`FormatBool`; structs use JSON. Add a `normalize*()` validator that rejects bad input with `newValidationError("<Serbian msg>")` |
| 4 | `iris-api/internal/store/settings_fixtures.go` | mirror the read + merge for fixture mode |
| 5 | `iris-api/internal/store/fixtures.go` | add the backing field to the fixture settings struct |
| 6 | `iris-api/internal/api/permissions_test.go` | extend `TestOrganizationSettings`: assert the default, assert an invalid value is rejected `422`, assert a field-only update persists without wiping siblings |
| 7 | `apps/web/src/types/settings.ts` | type + `DEFAULT_*` |
| 8 | `apps/desktop/model/settings.ts` + `apps/desktop/src/renderer/src/types/settings.ts` | same type + default (contract-sync; keep both in step) |
| 9 | `apps/web/src/contexts/OrganizationContext.ts` | add `value` + `setValue` to the context type |
| 10 | `apps/web/src/App.tsx` | provider state, hydrate from loaded settings, add to provider value |
| 11 | `apps/web/src/lib/fixture-api.ts` | module var + map it in `getSettings`/`updateSettings` |
| 12 | `apps/web/src/components/settings/<Name>Settings.tsx` | **new** admin card — copy `ShippingOptionsSettings.tsx` (bool) or `BillingDefaultsSettings.tsx` (default+override). Calls `window.api.updateSettings`, writes back via the context setter, toasts |
| 13 | `apps/web/src/pages/SettingsPage.tsx` | render the new card (admin-only, matching the others) |
| 14 | `apps/web/src/i18n/locales/sr.ts` + `en.ts` | `settings.<name>.*` keys (title/hint/label/saved/saveError…). Serbian is source of truth; use the `add-translation` skill's rules |

The `OrganizationSettingsUpdate` pointer pattern matters: a `nil` field means
"leave as-is", so a single-field save never clobbers the others. The store test
in #6 is what proves that.

## 2. Sweep for dependent UI (do not skip)

This is the half that gets forgotten. Grep for the **underlying field name**
(not the setting) and gate every reader. Check each of these surfaces:

```bash
cd apps/web
# e.g. underlying field = billingDocumentType
grep -rn "billingDocumentType" src --include="*.ts" --include="*.tsx"
```

| Surface | Where | Gate |
| --- | --- | --- |
| Work-order **form** field(s) | `components/WorkOrders/WorkOrderForm.tsx` | wrap the `FieldShell`/block in `{show && (…)}`; for default+override, also seed the new-order default from the setting |
| List **filter** pill | `components/WorkOrders/WorkOrdersFilters.tsx` | hide the `FilterPill` when the setting makes it meaningless (e.g. a pinned type ⇒ the "all types" filter matches all-or-nothing) |
| Table **column** | `lib/work-order-columns.ts`, `components/WorkOrders/WorkOrdersTable.tsx` | drop/hide the column if the value is constant shop-wide (judgement call — confirm with the user) |
| **Detail** / summary rows | `pages/WorkOrderDetailPage.tsx`, form summary | hide the row if the field is hidden |
| **Print / PDF** | `components/WorkOrders/WorkOrderPrintSheet.tsx`, `iris-api/internal/reports/*` | already has its own `pdfSections` toggles — check whether this field should follow |
| **CSV export** | `lib/work-orders/csv-export.ts` | usually keep (export is a superset), but note it |

Read the setting in components via `const { <value> } = useOrganization();`.

> The **desktop renderer has no `OrganizationContext`.** By repo precedent the
> on/off control is web-only; the desktop form keeps showing the field (don't
> silently remove a terminal capability with no way to bring it back). Keep the
> desktop **type** in contract-sync (step #8) and call out the gap in your report.
> Wiring desktop to fetch org settings is a separate, larger task.

## 3. Validate

```bash
cd iris-api && go build ./... && go test ./...
cd apps/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
cd apps/desktop && npm run typecheck && npm test
```

## 4. Report

- List the plumbing files touched against the table in step 1 (confirm none
  skipped, especially the desktop type mirror and both i18n bundles).
- List **every dependent UI surface** you swept and how you gated it, plus any
  you deliberately left (with the reason — e.g. CSV export kept as a superset).
- State the default value and where the admin toggle lives
  (`Settings → <Serbian card title>`).
- Flag the desktop web-only caveat.
