# Iris — Demo Walkthrough

A guided, end-to-end demo of the Iris operations workspace for **Štamparija
Čobanović**. Follow it top to bottom for a complete tour, or jump to a section.
Every step lists what to click and what you should see.

> UI text is Serbian (`sr-Latn`); this guide labels each step with the on-screen
> Serbian text so you can follow along verbatim.

---

## 0. Prerequisites

Start the three pieces (see [REPO_MAP.md](../REPO_MAP.md) for details):

```bash
# Backend (from iris-api/) — seed demo data first
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl migrate
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-demo
DATABASE_PATH=./data/iris.db IRIS_SESSION_SECRET=dev-secret go run ./cmd/server   # :8080

# Web (from apps/web/)
npm run dev    # :5173
```

- Demo login (non-production only): **`admin` / `admin123`**.
- Open <http://localhost:5173>.

> The seed creates a spread of work orders across recent months plus a set of
> customers and locations, so the dashboard, charts, and filters all have data.

---

## 1. Prijava (Login)

1. At <http://localhost:5173> you land on **Dobrodošli**.
2. Enter `admin` / `admin123`, click **Prijavite se**.
3. You arrive on **Kontrolna tabla** (Dashboard).

What it demonstrates: cookie session auth (`iris_session`). All app routes are
behind auth; the public tracking page (§8) is the only unauthenticated screen.

---

## 2. Kontrolna tabla (Dashboard triage)

The landing screen, titled **Kontrolna tabla** — "Klijenti, rokovi i otvoreni
redovi rada".

1. **Zahteva pažnju** ("Needs attention") groups open work by customer, ordered
   most-urgent-first. The chips on the right summarize the queues:
   - **Kasni** (overdue), **Danas** (due today), **Ove nedelje** (this week),
     **Čeka klijenta** (waiting on customer) — each with a count.
2. Click any chip to scope the list to that queue; click a customer row's **›**
   to drill straight into the work-orders list filtered to that customer.
3. Scroll to **Interno** for internal signals (e.g. *Materijal*, *Nedodeljeno*).
4. Scroll to the **Admin** section **Finansije i trendovi** (collapsed by
   default — expand it) to see the charts:
   - **Radni nalozi po mesecu** (work orders per month) — hover a bar; the
     tooltip reads the month and count, e.g. *“jun '26 / 14 naloga”*.
   - **Prihod po mesecu** (revenue per month).

What it demonstrates: client-side dashboard aggregation (the client fetches work
orders and computes the queues/series in the browser) and deep-link drill-downs
into the filtered list.

---

## 3. Radni nalozi (Browse, filter, search, sort)

Open **Radni nalozi** from the sidebar.

1. **Columns:** Br. naloga, Klijent, Opis posla, Operater, Prioritet, Tip
   dokumenta, Plan, Cena, Status, plus a pinned **Radnje** (actions) column.
2. **Search** (`Pretraži…`, or press `/` to focus it). The search matches across
   **order number, client, job description, operator, priority, document type,
   price, and dates** — and it understands the Serbian labels and formatting:
   - type `marko.petrovic` → matches by operator
   - type `Hitno` → matches high-priority orders (label), or `urgent` (raw value)
   - type `Faktura` / `Profaktura` → matches by document type
   - type `67.000` or `67000` → matches by price
   - type `30.09.2026` → matches by date
3. **Filters** (pill buttons): **Svi statusi**, **Svi tipovi**, **Sve dostave**,
   **Svi redovi**. Each opens a popover; pick a value to filter. Active filters
   show an accent dot.
4. **Sort:** click any column header to sort; click again to flip direction.
5. **Pagination & page size:** bottom bar ("Ukupno N naloga · stranica X od Y")
   with a page-size selector.
6. **Per-row actions** (the pinned **Radnje** column, larger icons): toggle
   status, **Izmeni** (edit), **Dupliraj** (duplicate), **Obriši** (delete).
   The column stays visible while you scroll the table horizontally.

What it demonstrates: the list is filtered/sorted/paginated client-side from a
single fetch, with shareable filter state in the URL.

---

## 4. Novi radni nalog (Create)

Open **Novi nalog** (sidebar) or **+ Novi radni nalog** (top right of the list).

1. **Klijent:** either pick an existing customer in **Klijent iz evidencije** or
   type a free-text **Naziv klijenta** (required).
2. **Opis posla** (required): e.g. *“Letci A5, 500 kom”*.
3. Optionally expand **Prikaži detalje posla**, set **Dodela i raspored**
   (Operater, Prioritet, Planirano), **Dokument i isporuka** (Tip dokumenta,
   Način dostave, Broj dokumenta, Datum izdavanja — defaults to today), and a
   price. The right-hand **Procena** panel previews the summary live.
4. Click **Sačuvaj nalog**. You're redirected to the new order's detail page
   (e.g. `RN-2026-00XX`), and its timeline starts with **Nalog kreiran**.

What it demonstrates: `react-hook-form` + `zod` validation, the shared
`window.api` data path, and server-assigned order numbers.

---

## 5. Detalji naloga (Detail + Tok posla)

Open any order (click a list row, or the one you just created).

1. **Header actions** (wrap to stay reachable at any UI scale):
   - **Pomeri u {next status}** — advance the status (see §6).
   - **Štampaj** (print), **PDF** (server-rendered report).
   - **Javni link** — copies the customer tracking URL (see §8).
   - **Dupliraj** — start a new order pre-filled from this one.
   - **Izmeni** — edit.
   - **Obriši** — delete (with confirmation).
2. **Sažetak za klijenta** + meta grid (Status, Rok, Broj naloga, Tip dokumenta,
   Operater, Planirano, Datum izdavanja, Dostava…).
3. **Tok posla** (the timeline): every meaningful change is recorded —
   *Nalog kreiran*, status changes, and **field-change diffs** rendered as
   `Polje: stara vrednost → nova vrednost` (e.g. *“Cena: 1.000 RSD → 67.000
   RSD”*, *“Prioritet: Normalan → Hitno”*). See §5a to generate one live.
4. **Stavke / Materijal / Vreme / Prilozi / Faktura** panels show line items and
   related records.

### 5a. Edit to produce a diff in Tok posla
1. From the detail page, click **Izmeni**.
2. Change a few fields — e.g. **Cena**, **Operater**, **Prioritet**.
3. **Sačuvaj** → back on the detail page, **Tok posla** now shows one diff event
   per changed field with the before → after values.

What it demonstrates: server-side change tracking (the API diffs the pre/post
order and appends timeline events) with localized labels and `sr-Latn`
formatting for dates and prices.

---

## 6. Promena statusa (Status lifecycle)

Status transitions are guided — only valid next steps are offered.

1. On the detail page (or via the list's row action), click **Pomeri u
   {sledeći status}** (e.g. *Pomeri u Dodeljen*).
2. The badge updates, a **Status promenjen na …** entry appears in **Tok posla**,
   and completing/invoicing sets the completion date automatically.

Lifecycle: `Nov → Dodeljen → U toku → (Čeka klijenta / Čeka materijal) →
Završen → Fakturisan`, with `Otkazan` available where allowed.

What it demonstrates: server-enforced transition rules; the UI only surfaces
legal moves.

---

## 7. Klijenti i lokacije (Customers & locations)

Open **Klijenti** from the sidebar — titled **Klijenti i lokacije**.

1. Browse customers; each can have multiple **lokacije** (delivery locations).
2. Add / edit a customer and its locations, then **Sačuvaj**.
3. Back in **Radni nalozi**, the new customer is selectable in the create form
   and appears in the customer filter / dashboard grouping.

What it demonstrates: customer + location CRUD feeding the rest of the app.
(Web has full customer management; the desktop client currently stops at work
orders + dashboard.)

---

## 8. Javno praćenje (Public tracking — customer-facing)

1. On a work order's detail page, click **Javni link** to copy its tracking URL
   (`/public/work-orders/{token}`).
2. Open that URL in a private/incognito window (no login required).
3. The customer sees a read-only status page with the current stage and the
   plain-language next step, without any internal data.

What it demonstrates: tokenized, unauthenticated public status sharing.

---

## 9. Pristupačnost i izgled (Accessibility & appearance)

Open **Podešavanja** (Settings).

1. **Tema** — light/dark (**Svetli ili tamni prikaz aplikacije**).
2. **Veličina teksta** — UI scale: *Mala, Podrazumevana, Velika, Veoma velika*.
   Pick **Veoma velika**; the whole UI scales up. Verify that popovers,
   dropdowns, and dialogs still open anchored to their triggers (the scaling
   uses a CSS transform so overlay positioning stays correct), and that detail-
   page action buttons wrap instead of overflowing.
3. **Gustina liste** (list density) — compact ↔ comfortable row heights.
4. Changes apply immediately and persist locally.

What it demonstrates: accessibility-oriented scaling and per-user display
preferences.

---

## 10. Admin — šifarnici i trendovi

1. In **Podešavanja**, the **Admin** area exposes **šifarnici** (custom enum
   values): add/edit allowed values for priority, document type, delivery
   method, postage payment, and **jedinica mere** (invoice line-item unit of
   measure). New values become selectable in the work-order form — e.g. add a
   **Jedinica mere** like *Tabak* and it appears in the invoice line-item
   **Jedinica** dropdown. Built-in values stay locked.
2. Back on the **Kontrolna tabla**, the **Finansije i trendovi** charts reflect
   the seeded history (orders/revenue per month).

What it demonstrates: admin-managed reference data and reporting.

> **Access control note:** role gating in the UI (`role === 'admin'`) is a
> convenience only. The **API** enforces session + admin on destructive routes —
> the UI check is not a security boundary.

---

## 11. Odjava (Logout)

Click **Odjava** (bottom of the sidebar) to clear the session and return to the
login screen.

---

## Feature checklist

| Aspect | Where | What to verify |
| --- | --- | --- |
| Auth / session | Login, Logout | Login works; protected routes redirect when logged out |
| Dashboard triage | Kontrolna tabla | Queue chips + counts; drill-down into filtered list |
| Reporting | Finansije i trendovi | Per-month orders/revenue charts; tooltip = month + “N naloga” |
| List browse | Radni nalozi | Columns, pagination, page size |
| Search | Radni nalozi | Matches number/client/desc/operator/priority/doc-type/price/dates (labels + raw) |
| Filters | Radni nalozi | Status / type / delivery / queue popovers; active-dot |
| Sort | Radni nalozi | Header click sorts + flips direction |
| Row actions | Radni nalozi (Radnje) | Status toggle, edit, duplicate, delete; pinned & enlarged |
| Create | Novi nalog | Validation; redirect to new order; “Nalog kreiran” event |
| Detail timeline | Tok posla | Created/status/field-diff events with before → after |
| Detail actions | Detail header | Status, print, PDF, public link, duplicate, edit, delete |
| Status lifecycle | Detail / list | Only valid transitions offered; completion date auto-set |
| Customers | Klijenti i lokacije | Customer + location CRUD; feeds create form + filters |
| Public tracking | /public/work-orders/{token} | Read-only, no login, no internal data |
| Accessibility | Podešavanja | Theme, text scale (overlays stay anchored), list density |
| Admin reference data | Podešavanja | Custom enum values appear in the form |

---

## Notes & known demo quirks

- **Demo credentials** `admin` / `admin123` are blocked when
  `IRIS_ENV=production`.
- Some seeded orders have a blank **operater/issuer** (e.g. "još nije
  dodeljeno"); these remain fully editable — updating an existing order does not
  require an issuer (only creation does).
- The desktop client (`apps/desktop`) mirrors the dashboard and work-order
  surfaces but does not yet include customer management or public tracking.
