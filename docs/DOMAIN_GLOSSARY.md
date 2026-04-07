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
| Created date | `createdAt` | ISO date string used as the primary reporting date. |
| Completed date | `completedAt` | ISO date string for completion, or `null` when still in progress. |
| Price | `price` | Monetary value of the work order; `null` means not billed or not set. |

## Work-Order Status Terms

| Term | Code rule | Meaning |
| --- | --- | --- |
| Completed | `completedAt !== null` | Work order is finished. |
| In progress | `completedAt === null` | Work order is still open or unfinished. |
| Revenue-bearing order | `price !== null` | Order contributes to revenue totals. |
| Non-revenue order | `price === null` | Order is excluded from revenue totals. |

## Dashboard Terms

| UI term | Code term | Meaning |
| --- | --- | --- |
| `Kontrolna tabla` | `DashboardPage` | The admin dashboard screen. |
| Summary cards | `DashboardSummary` | Top-line reporting metrics shown above the charts. |
| Total orders | `totalOrders` | Count of work orders in the current dataset or filtered dataset. |
| Completed orders | `completedOrders` | Count of work orders with a non-null `completedAt`. |
| In-progress orders | `inProgressOrders` | Count of work orders with a null `completedAt`. |
| Total revenue | `totalRevenue` | Sum of all non-null work-order prices. |
| Filters | `DashboardFilters` | Dashboard constraints for date range and operator. |
| Top clients | `topClients(...)` | Clients ranked by work-order volume in the current filtered dataset. |

## Document Types

These are the current `documentType` enum values in the codebase.

| Code value | Serbian label | Meaning |
| --- | --- | --- |
| `invoice` | `Faktura` | Invoice-style document. |
| `receipt` | `Racun` | Receipt-style document. |
| `contract` | `Ugovor` | Contract-style document. |
| `certificate` | `Potvrda` | Certificate or confirmation document. |

Note:

- Labels are currently mapped in `apps/desktop/src/renderer/src/lib/dashboard/labels.ts`.

## Delivery Methods

These are the current `deliveryMethod` enum values in the codebase.

| Code value | Serbian label | Meaning |
| --- | --- | --- |
| `email` | `E-posta` | Delivered electronically by email. |
| `pickup` | `Licno preuzimanje` | Picked up in person. |
| `courier` | `Kurir` | Delivered by courier. |
| `fax` | `Faks` | Delivered by fax. |

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
