# Domain Glossary

This glossary records the business and application terms that appear in the Iris desktop app today.

## Core Product Terms

| Term | Code term | Meaning |
| --- | --- | --- |
| Iris | `Iris` | The desktop application for Stamparija Cobanovic. |
| Stamparija Cobanovic | n/a | The print shop/business this software is being built for. |
| Desktop app | `apps/desktop` | The Electron application currently present in the repository. |
| Admin | `role: 'admin'` | A user allowed to access the dashboard and admin-only surfaces. |
| User | `role: 'user'` | A non-admin account that can authenticate but is blocked from the dashboard. |

## Authentication Terms

| Term | Code term | Meaning |
| --- | --- | --- |
| Authenticated user | `AuthenticatedUser` | The renderer-visible representation of the logged-in user. |
| Login response | `LoginResponse` | Result returned from the `auth:login` IPC channel. |
| Access denied | `AccessDenied` | Renderer state shown when a logged-in user is not an admin. |

## Work-Order Terms

| Term | Code term | Meaning |
| --- | --- | --- |
| Work order | `WorkOrder` | The main business record used for dashboard reporting. |
| Client | `clientName` | The customer associated with a work order. |
| Operator | `issuedBy` | The staff username associated with issuing a work order. |
| Issue date | `issueDate` | ISO date string used as the primary reporting date. |
| Completion date | `completionDate` | ISO date string for completion, or `null` when still in progress. |
| Status | `status` | Work order lifecycle state: `draft`, `active`, `completed`, or `cancelled`. |
| Price | `price` | Monetary value of the work order; `null` means not billed or not set. |

## Work-Order Status Terms

| Term | Code rule | Meaning |
| --- | --- | --- |
| Completed | `status === 'completed'` and `isCompleted === true` | Work order is finished. `completionDate` is set. |
| In progress | `status === 'active'` and `isCompleted === false` | Work order is still open or unfinished. |
| Revenue-bearing order | `price !== null` | Order contributes to revenue totals. |
| Non-revenue order | `price === null` | Order is excluded from revenue totals. |

## Dashboard Terms

| UI term | Code term | Meaning |
| --- | --- | --- |
| `Kontrolna tabla` | `DashboardPage` | The admin dashboard screen. |
| Summary cards | `DashboardSummary` | Top-line reporting metrics shown above the charts. |
| Total orders | `totalOrders` | Count of work orders in the current dataset or filtered dataset. |
| Status counts | `statusCounts` | Per-status breakdown (`draft`, `active`, `completed`, `cancelled`) derived from `order.status`. |
| Total revenue | `totalRevenue` | Sum of all non-null work-order prices. |
| Filters | `DashboardFilters` | Dashboard constraints for date range and operator. |
| Top clients | `topClients(...)` | Clients ranked by work-order volume in the current filtered dataset. |

## Document Types

These are the current `billingDocumentType` enum values in the codebase.

| Code value | Serbian label | Meaning |
| --- | --- | --- |
| `invoice` | `Faktura` | Invoice-style document. |
| `cashCollection` | `Gotovinski račun` | Cash collection document. |
| `proforma` | `Profaktura` | Proforma invoice. |

Note:

- Labels are currently mapped in `apps/desktop/src/renderer/src/shared/utils/work-orders.ts`.

## Delivery Methods

These are the current `deliveryMethod` enum values in the codebase.

| Code value | Serbian label | Meaning |
| --- | --- | --- |
| `pickup` | `Lično preuzimanje` | Picked up in person. |
| `postExpress` | `Post Express` | Delivered via Post Express. |
| `cityExpress` | `City Express` | Delivered via City Express. |
| `fieldVisit` | `Terenski obilazak` | Delivered by field visit. |

## Data And Reporting Terms

| Term | Code term | Meaning |
| --- | --- | --- |
| Monthly bucket | `MonthlyBucket` | Aggregated count and revenue for a single `YYYY-MM` month. |
| Delivery distribution | `DeliveryCount[]` | Per-method volume counts used by the dashboard chart. |
| Client ranking | `ClientCount[]` | Ranked client counts used in the top-clients panel. |
| Operators list | `getWorkOrderOperators()` | Unique sorted set of `issuedBy` values for the filter UI. |

## Fixture Terms

| Term | Meaning |
| --- | --- |
| Fixture data | Local JSON data used instead of a live backend in the current implementation. |
| `users.json` | Fixture file backing local login. |
| `work-orders.json` | Fixture file backing dashboard reporting. |

## Important Modeling Notes

- The current shared work-order model is intentionally small and optimized for the dashboard that exists today.
- The renderer also has its own work-order type file because the UI layer carries dashboard-specific contracts such as `DashboardFilters` and `DashboardSummary`.
- If the work-order schema changes, update this glossary and both work-order type definitions.
