# Domain Glossary

This glossary maps the business, operational, and database terms used across the Iris suite, aligning the visible Serbian UI labels (`sr-Latn`) with the English code identifiers in types, structs, and schemas.

---

## Core Suite Context

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Iris Suite** | `Iris` | n/a | The unified operations suite: web client and Go API. |
| **Web Client** | `apps/web` | n/a | Lightweight React application for remote management and public order lookup. |
| **Backend API** | `iris-api` | n/a | Go REST API serving as the single source of truth for workspace operations. |
| **Tenant / Organization** | `Tenant` | `Organizacija` | An isolated organization (shop). Every row is scoped to a tenant; users log in with the tenant's **org slug** (`orgSlug`). Seeded production tenant: `grafika-cobanovic` (Grafika Čobanović); demo tenant: `demo`. |
| **Admin** | `role: 'admin'` | `Administrator` | Staff role authorized to access performance charts, organization settings, and billing configurations. |
| **Operator** | `role: 'user'` | `Operater` | Standard staff role focused on order execution, tracking time, and updating status. |

---

## Normalized CRM Layers

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Customer** | `Customer` | `Klijent` | Centralized corporate or retail client profile containing base contact metadata. |
| **Location** | `Location` | `Lokacija / Adresa` | Shipping addresses registered under a client's profile. |
| **Assignment** | `Assignment` | `Zaduženje` | Operational dispatch details indicating operator (`assignedTo`) and priority level. |
| **Priority** | `priority` | `Prioritet` | Operational urgency scale: `low` (nizak), `normal` (normalan), `high` (visok), `urgent` (hitno). |

---

## Work-Order & Printing Terms

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Work Order** | `WorkOrder` | `Radni nalog` | The central execution record in the print shop. |
| **Order Number** | `orderNumber` | `Broj naloga` | Unique per-tenant order reference `RN-<year>-<seq>` with a 5-digit sequence (e.g., `RN-2025-00042`). Can be pre-reserved before save (see reservation endpoints). |
| **Job Description** | `jobDescription` | `Opis posla` | Summary of print work requested (e.g., "Štampa vizit karti"). |
| **Product Code** | `productCode` | `Šifra proizvoda` | Inventory or catalog system code representing paper/product style. |
| **Paper Weight** | `paperWeightGsm` | `Gramatura (g/m²)` | Weight/thickness of the paper stocks used in production. |
| **Dimensions** | `dimensions` | `Dimenzije` | Physical format dimensions (e.g., `A4`, `85x55 mm`). |
| **Quantity** | `quantity` | `Količina` | Count of units or impressions to produce. |
| **Finishing Note** | `finishingNote` | `Dorada` | Post-press finishing commands (e.g., plastifikacija, sečenje, savijanje). |
| **Due Date** | `dueDate` | `Rok završetka posla` | Deadline to finish the job; drives the "Kasni" / "Danas dospeva" signals. |
| **Proforma Due Date** | `proformaDueDate` | `Rok izdavanja predračuna` | Deadline to issue the proforma invoice (predračun); distinct from `dueDate`. |
| **Executor** | `executedBy` | `Izvršilac` | Operator recorded as having carried out the work. |

---

## Operational Lifecycle

Work orders progress sequentially through a defined lifecycle. Transitions are strictly validated at both client and server boundaries.

| Code Status | Serbian UI Label | Meaning & Terminal Status Check |
| --- | --- | --- |
| `new` | `Nov` | Initial state. Order is created but operator has not been assigned. |
| `assigned` | `Dodeljen` | Operator assigned and target scheduled date set. |
| `inProgress` | `U toku` | Physical production is currently active on the shop floor. |
| `completed` | `Završen` | Physical work finished. Eligible to move to billing. |
| `cancelled` | `Otkazan` | Job aborted. Terminal status. |
| `invoiced` | `Fakturisan` | Job invoiced. Invoice draft compiled. Terminal status. |

---

## Tracking, Execution & Billing

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Internal Notes** | `internalNotes` | `Interne napomene` | Internal communication only visible to print-shop operators. Gated. |
| **Customer Notes** | `customerNotes` | `Napomene za klijenta` | Public-facing comments visible to clients on tracking portals. |
| **Time Entry** | `TimeEntry` | `Evidencija rada` | Record of how many minutes a specific operator spent on production. |
| **Material Usage** | `MaterialUsage` | `Utrošak materijala` | Record of materials (e.g. inks, plates, media) consumed during print runs. |
| **Invoice Draft** | `InvoiceDraft` | `Nacrt fakture` | Line-item container tracking billing items and invoicing states. |
| **Draft Status** | `InvoiceDraftStatus` | `Status fakture` | Invoicing states: `none`, `draft` (nacrt), `issued` (izdata), `paid` (plaćena). |
| **Public Token** | `publicToken` | `Javni token` | Secure unique hash enabling customers to access public tracking pages. |

---

## Delivery & Billing Classifications

### Billing Document Type (`BillingDocumentType`)
How the job is billed (`Tip dokumenta`) — the single money-side choice on a work
order, ticked as one of the three boxes on the printed nalog. Optional per order;
extendable by an admin through the `billingDocumentType` managed enum.
- `invoice` (`Faktura`): Standard invoice billing.
- `cashCollection` (`Otkup`): Cash collected on delivery.
- `proforma` (`Profaktura`): Pre-payment request sheet.

Catalog sale prices are net (bez PDV-a). On an `cashCollection` (otkup) order the
web form prices catalog articles (roba) gross, at the item's PDV type; catalog
services keep their catalog price. Faktura and profaktura keep net prices.

### PDV Type (catalog `taxGroup`)
The catalog item's `taxGroup` (`Poreska grupa`) holds the fiscal-receipt tax label:
- `DJ`: General rate (opšta stopa), 20% — `Đ` on fiscal receipts. Default for empty or unknown codes.
- `E`: Special rate (posebna stopa), 10%.
- `A`: Exempt from PDV, 0%.

### Delivery Method (`DeliveryMethod`)
- `pickup` (`Lično preuzimanje`): Client collects order in person.
- `postExpress` (`Post Express`): Delivered via Post Express courier.
- `cityExpress` (`City Express`): Delivered via City Express courier.
- `fieldVisit` (`Terenski obilazak`): Installed or delivered by print staff on site.

---

## Organization Settings (shop-wide, admin-configurable)

Stored per tenant in the key/value `app_settings` table and exposed via
`GET`/`PUT /settings`. A missing key falls back to a coded default, so adding a
setting needs no migration.

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Firm Name** | `firmName` | `Naziv firme` | Shop name printed on documents. |
| **PDF Sections** | `pdfSections` | `Sekcije PDF-a` | Which sections appear on the work-order printout. |
| **Billing Defaults** | `billingDefaults` | `Podrazumevani obračun` | Default `documentType` for new orders. Default `proforma`; operators can always change it per order. |
| **Priority Defaults** | `priorityDefaults` | `Podrazumevani prioritet` | Default `priority` for new orders + `allowOverride`. Default `normal`, not overridable. |
| **Show Shipping Options** | `showShippingOptions` | `Prikaži opcije otpreme` | Toggles the extra shipping/handling fields on the work-order form. Off by default. |

## Work-Order Processes

Admin-modeled production graphs (see [D-017](DECISIONS.md#d-017-model-work-order-processes-as-a-separate-graph-not-as-new-statuses)). Independent of the order `status` lifecycle.

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Process Template** | `ProcessTemplate` | `Proces rada` | Per-tenant reusable graph. At most one is the default (`isDefault`), copied onto every new work order. |
| **Work-Order Process** | `WorkOrderProcess` | `Proces rada naloga` | The order's own editable copy of a template graph plus per-order state. |
| **Step** | `step` | `Korak` | A process stage. Per-order `status`: `pending` (`Na čekanju`), `in_progress` (`U toku`), `done` (`Završeno`), `skipped` (`Preskočeno`). |
| **Input** | `input` | `Ulaz` | Material a step consumes (planned `quantity`/`unit`, per-order `actualQuantity`). Only connects into a step. |
| **Product** | `product` | `Proizvod` | Output of a step; may feed a later step as an intermediate product. |
| **Byproduct** | `byproduct` | `Nusproizvod` | Side output of a step (waste, offcuts, makulatura); may feed a later step. |

| **Starting Step** | `start` | `Početni korak` | Optional marker on a step; any number of steps may be marked. The tester stops warning that a marked step has no input, and warns if another step leads into it. |
| **Final Output** | `final` | `Krajnji izlaz` | Optional marker on a product/byproduct: it counts as a result of the process (simulator totals, yield) even when a later step also consumes it. Unmarked outputs with no outgoing edge count anyway. |

Allowed edges: input→step, step→step, step→product, step→byproduct, product→step, byproduct→step; the graph must be acyclic.
A process may have any number of inputs, starting steps, products and byproducts. The role belongs to the node, not the article: the same catalog article may be an input in one node and a product or byproduct in another (even in the same graph), and an item node's role can be switched in place in the editor (connections the new role does not allow are dropped). `start`/`final` are structure: only admins change them on a work-order process.

## Warehouse (Magacin)

Stock of catalog **articles**, kept as a movement ledger (see [D-018](DECISIONS.md#d-018-iris-owns-warehouse-stock-as-a-movement-ledger)).

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **On hand** | `onHand` | `Na stanju` | Sum of the article's stock movements. |
| **Reserved** | `reserved` | `Rezervisano` | Planned inputs of open work orders whose consuming step is not done yet. |
| **Available** | `available` | `Raspoloživo` | On hand − reserved. |
| **Minimum stock** | `minStock` | `Minimalna zaliha` | Optional threshold; below it the article is flagged as low. |
| **Goods receipt** | `receipt` | `Prijem robe` | Incoming material (+). Any user. |
| **Stock count** | `adjustment` / `opening` | `Popis` / `Početno stanje` | Admin enters counted quantities; the difference is posted. The first count of an article is its opening balance. |
| **Consumption / Production** | `consumption` / `production` | `Utrošak` / `Proizvodnja` | Posted automatically from work-order processes when steps are done. |

## Concurrency & Reservation

| English Term | Code Token | Serbian UI Label | Meaning & Context |
| --- | --- | --- | --- |
| **Edit Lock** | `EditLock` | `Zaključavanje izmena` | Exclusive, heartbeat-kept, auto-expiring per-order edit lock (TTL 2 min; 30 s heartbeat). Another holder makes the form read-only; the client fails open on error. |
| **Reserved Order Number** | `ReservedOrderNumber` | `Rezervisani broj naloga` | Order number pre-reserved before save (12 h TTL) so the create form can show the next `RN-<year>-<seq>`. |

## Important Modeling & Schema Rules

1. **Strict Note Separation**: To preserve confidentiality, **Internal Notes** (`internalNotes`) and **Customer Notes** (`customerNotes`) must never occupy the same database tables or client structures. Internal notes are structurally excluded from public status APIs.
2. **Unified Schema Alignment**: The fields, types, and validation rules specified in this glossary map directly to the OpenAPI specification contract (`iris-api/openapi.yaml`), Go domain types (`iris-api/internal/domain/types.go`), and React models. Keep all layers aligned when introducing domain alterations.

*Last verified against the checked-in repository state on 2026-07-10.*
