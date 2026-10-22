# Changelog

All notable changes to Iris. Generated from `.changeset/` files on merge to main; do not edit released entries by hand.

## 2.16.0 — 2026-10-22

### Minor

- Superadmin (Backoffice) sign-ins now last 8 hours instead of 2.

## 2.15.1 — 2026-10-20

### Patch

- Fix the frontend image build, which failed because the regulations guide Markdown was not copied into it.

## 2.15.0 — 2026-10-20

### Minor

- Organizations can now be given the e-Fakture and e-Otpremnice modules in the Backoffice, and admins of such organizations can enter their company details (legal name, PIB, MB, address, bank account, VAT payer) for government e-invoices and e-dispatch notes in Settings. First step of D-030.
- New public page /home/propisi (linked from the landing page): a Serbian guide to the law on e-invoices (SEF), e-dispatch notes and fiscal receipts, with deadlines, penalties and all sources.

## 2.14.1 — 2026-10-19

### Patch

- Proposed decision D-030 on integrating with SEF e-invoicing and eOtpremnica.

## 2.14.0 — 2026-10-19

### Minor

- Iris is now presented as an operations platform for any production or service business: new landing page, sign-in and guide wording, a general "Put jednog posla" chapter, and the demo organization is now "Demo Firma". An organization without a saved firm name now shows its own name.

## 2.13.0 — 2026-10-19

### Minor

- The landing page at /home is interactive: a sample work order you move through its statuses and view as the client, a status explorer, a live price example with PDV and margin, a module playground that follows the real dependency rules, a role switcher, a FAQ accordion and a contact button.

## 2.12.0 — 2026-10-19

### Minor

- Public landing page at /home presents Iris to prospective organizations: features, work-order lifecycle, modules, roles, security, onboarding steps and FAQ.

## 2.11.1 — 2026-10-19

### Patch

- Backoffice: the organization list is easier to scan. On a phone each organization is a compact card (name, status, an aligned facts grid and the three entries), and the housekeeping actions (edit, notes, export, suspend, delete) sit behind one overflow menu on both phone and desktop.
- UX pass across the app: date pickers show dates as DD.MM.YYYY like the rest of the app (planning and my-queue drop the duplicated date next to the picker); work-order numbers and client names no longer wrap in the orders table and its pinned actions column has a visible edge; the order detail facts strip no longer breaks a username mid-word; the work-orders header actions share rows on a phone; the attendance page gets the standard page header; the sign-in 'remember me' hint sits under its checkbox; and signing in no longer makes the same tab re-check its session (a loading flash after every sign-in, and no way in at all in fixture mode).

## 2.11.0 — 2026-10-19

### Minor

- Planning: working hours gain an inter-operation time (međuoperacijsko vreme, 0–480 min, default 0) that the planner inserts, in working time, between a step and its successors; hand-edited blocks that start sooner are flagged.
- Plan generation keeps the whole 14-working-day horizon on the plan (new horizonEnd field and admin GET /planning/plan/horizon grouped by day); the plan date remains what is published and shown. Planning a later day pins the still-open steps of the days published before it, and the forecast pins the published plans, so consecutive days and the forecast never contradict each other.
- Planning: machines can carry downtime windows (from–to, note) that the planner treats as busy and reports as machine_down / conflicts, and working hours gain exception dates (days off and one-off hours) that override the weekly pattern.
- Item-node quantities in process templates are now per unit of the order: reservations, automatic stock posting and the simulator multiply them by the work order quantity (behaviour change for processes attached from now on). Existing per-order process copies are flagged quantitiesPerOrder and keep their absolute amounts until a template is re-attached.
- Process steps now record when they actually started and finished: moving a step to in progress / done (for example from Moj red) stamps startedAt / finishedAt on the step, shown in the step details of the process page and correctable by administrators.
- Planning: a printable dispatch list (Radni raspored) per machine per day, with a per-worker variant, order quantities and daily totals; admins can print the draft and up to seven days.
- Planning: new workstation load endpoint (GET /planning/load) reports planned against available minutes per machine type, machine and person for each day of up to 31 days, read from the published plans' kept horizon.
- Planning forecast shows each open order's latest start date (Najkasniji početak), worked back from its due date over the remaining steps and the inter-operation time, in red once it has passed; also on the work-order page.
- Planning shows material needs by week: the input material the published plans will consume, per week and unplanned, against warehouse stock, with shortages first (Potrebe materijala, GET /planning/material-needs).
- Planning gains a read-only calibration report: it recommends the inter-operation time from measured step times and lists steps whose actual minutes deviate from the plan.
- Planning page: new Zauzetost tab shows per-day load bars for every machine type, machine and worker (under 80 %, 80-100 %, overloaded), with the day's blocks on tap and a click-through to that day's plan.

### Patch

- Planner ranks urgent orders above high ones at equal slack; the API contract documents PUT /attendance/{userId} under the attendance module instead of the retired /planning/attendance path.
- Re-planning places a step that is already in progress only for its remaining working minutes, and flags steps running longer than planned.

## 2.10.2 — 2026-10-19

### Patch

- The side menu now scrolls on phones and short screens, so items below the fold (Users, Documentation, Settings, sign-out) are reachable, including while a banner is shown.

## 2.10.1 — 2026-10-19

### Patch

- Decision record D-028: shop-floor scheduling follows the job-loading model (inter-operation time, actual step times, workstation load).

## 2.10.0 — 2026-10-19

### Minor

- The demo organization (irisctl seed-demo) now showcases every feature: settings, custom picklist values and a sign-in logo; customers with PIB, contacts and several locations; a catalog with stock, a scheduled price change and cleanup candidates; five process templates with start/final flags; a year of invoiced history for the charts; live orders in every status with an overdue, due-today, unassigned (cost review), signed-off, paid and cancelled one; two weeks of attendance, machines with one out of service, published and draft day plans; and a welcome announcement. Every date is relative to the day the seed runs; the fixture work orders are no longer loaded into the demo.

## 2.9.0 — 2026-10-19

### Minor

- Adds a Dokumentacija section: an illustrated guide to Iris and print-shop terms, from the first sign-in to planning, with a searchable glossary.

## 2.8.1 — 2026-10-19

### Patch

- The Iris logo now shows on the sign-in screen and at the top of the mobile menu, and the mobile menu opens below the impersonation and announcement banners instead of under them.

## 2.8.0 — 2026-10-19

### Minor

- Prisustvo (attendance) is now its own organization module: it can be switched on alone in the Backoffice and has its own page; Planiranje now requires it.

## 2.7.0 — 2026-10-19

### Minor

- Planiranje: an optional module for daily production planning. Admins record machines, who can run them, attendance and working hours, and give process steps a machine type, crew size and duration; the app proposes a day plan that respects deadlines, machines and people, admins adjust and publish it, operators follow their own queue, and every open order gets an estimated finish date.

## 2.6.0 — 2026-10-18

### Minor

- Process flows: item nodes can switch between input, product and byproduct in place, steps can be marked as starting steps and products/byproducts as final outputs, so a flow can clearly have several starts and several outputs.

## 2.5.0 — 2026-10-18

### Minor

- Backoffice superadmins can post announcements (info, warning or maintenance) to all or chosen organizations, with a start and optional end; organization users see them as a banner at the top of the app and on the sign-in page, and can dismiss info ones.
- The Backoffice has a System tab with the app version, database engine, schema version and size, and SQLite backups: take one on demand, list recent copies, optional automatic backups, and a dashboard warning when the last backup is too old.
- The Backoffice can download a full JSON export of an organization's data and permanently delete a suspended organization after its slug is typed again (both recorded in the activity log); irisctl gains export-tenant and delete-tenant.
- The Backoffice organization list shows each organization's activity (last sign-in, active users, recent and open work orders), marks dormant organizations, sorts and filters by activity, and keeps superadmin-only internal notes (contact, plan, notes) per organization.
- Backoffice superadmins can turn on two-factor sign-in (authenticator app plus one-time recovery codes; irisctl reset-platform-2fa resets it), failed Backoffice sign-ins are logged under Aktivnost, superadmins can be added with a temporary password and disabled from the new Superadmini tab, and signing in as an organization user now requires a short reason shown in the activity log.
- Two-factor sign-in is now mandatory for Backoffice superadmins.

### Patch

- Deleting an organization keeps its impersonation history.

## 2.4.0 — 2026-10-18

### Minor

- The app version is shown in the sidebar and in the Backoffice Sistem panel together with the API version, commit and database engine (with a warning when the web app and API versions differ); sign-in screens now scroll on small phones and with the keyboard open; and irisctl migrate-to-postgres -check reports foreign-key violations, which the migration now refuses up front with the cleanup statement instead of failing mid-copy.

## 2.3.0 — 2026-10-18

### Minor

- The API can run on PostgreSQL, and irisctl can migrate an existing SQLite database into it.

## 2.2.0 — 2026-10-18

### Minor

- Work-order list filters, sorts and pages on the server (CSV export via GET /work-orders/export.csv); search ignores diacritics (č/ć/š/ž/đ); the web app caches API data with TanStack Query.
- Sign-in sessions now stay alive while in use (12 h idle, 24 h at most) and "Zapamti me na ovom uređaju" keeps you signed in for up to 30 days. Session tokens are stored hashed (everyone signs in once more after the upgrade), failed sign-ins are rate limited, a password change signs that user out elsewhere, cross-site write requests are refused, and IRIS_SESSION_SECRET is no longer required.

### Patch

- Sign-in limits can no longer be used to lock someone else out (5 failed attempts per account from one address, 20 per address, 50 per account overall), nginx trusts forwarded client addresses only from configured proxies (IRIS_TRUSTED_PROXY), new work orders can never overwrite an existing one, CSV export neutralizes formula-like cells and follows the UI language, client name sort handles č/ć/š/ž/đ, empty due dates no longer count as overdue, and other tabs follow a sign-in or sign-out.

## 2.1.2 — 2026-10-18

### Patch

- Deploy workflow now prunes superseded iris image tags, not just dangling layers. Each release is a tagged git-<sha> image (~1.1GB backend), and docker image prune -f only removes untagged images, so old releases accumulated until the shared host's disk filled and the site went down with a SQLite disk I/O error. The deploy now also removes old iris-backend/iris-frontend tags, keeping the deployed release and latest (older builds re-pull from GHCR for rollback).

## 2.1.1 — 2026-10-18

### Patch

- The backend Docker image now ships the irisctl operations CLI alongside the server, so migrations, seeding and backups can run inside the container (docker compose -f docker-compose.prod.yml run --rm --entrypoint irisctl backend …) without a separately built binary.

## 2.1.0 — 2026-10-18

### Minor

- seed-demo can namespace the demo fixture record ids with -id-prefix (or IRIS_DEMO_ID_PREFIX), so the demo organization can be seeded into a database that already holds another tenant using the same fixed fixture ids (e.g. the real Grafika Čobanović data, whose customers are also cust-N) without an id collision. Default behavior is unchanged.

## 2.0.0 — 2026-10-18

### Major

- Merge the demo and showcase sample organizations into one. seed-demo now builds a single "demo" organization with both the Procesi rada and Magacin modules on: the testdata/fixtures work orders plus process- and stock-driven sample content (four templates, eight orders, warehouse stock, an operater login). In production, where the server refuses to start on the demo admin/admin123 login, seed-demo requires strong passwords via IRIS_DEMO_ADMIN_PASSWORD and IRIS_DEMO_OPERATOR_PASSWORD (or -admin-password / -operator-password). The separate seed-showcase command and the IRIS_SEED_SHOWCASE / IRIS_SHOWCASE_* server flags are removed.

## 1.2.2 — 2026-10-17

### Patch

- Backoffice organization actions are grouped: Users, Processes and Modules as equal tiles, with Edit and Suspend/Reactivate set apart below them.

## 1.2.1 — 2026-10-17

### Patch

- Backoffice organization users dialog no longer squeezes names and buttons on phones.

## 1.2.0 — 2026-10-17

### Minor

- Work-order processes: admins model each production process as an editable graph of steps with their inputs, products and byproducts (Settings → Procesi rada, and per organization in the Backoffice). Every work order carries its own copy with per-step status and actual quantities, applied automatically from the default process.
- Process simulator and tester: play a process wave by wave for a chosen quantity (inputs used, products, byproducts, yield) and check the model for problems before using it. Smoother animations on the process screens and in the Backoffice.
- Magacin: Iris now tracks warehouse stock for catalog articles (goods receipts, stock counts and opening balance, movement history, low-stock warnings). Process steps linked to articles move stock automatically when completed, and the simulator and tester flag material shortages.
- Procesi rada and Magacin are now optional modules per organization, off by default (Procesi rada requires Magacin); superadmins switch them in Backoffice → Organizacije → Moduli.
- A showcase organization with sample processes and warehouse stock can be created with irisctl seed-showcase, or automatically on the first server start with IRIS_SEED_SHOWCASE=1 (production requires its own passwords).

## 1.1.3 — 2026-10-17

### Patch

- Backoffice: chart taps no longer leave an orange focus outline, and the overview now labels tenants as Clients and their customers as Downstream clients.

## 1.1.2 — 2026-10-17

### Patch

- Backoffice organizations page works on phones: organizations show as cards and dialogs open on-screen.

## 1.1.1 — 2026-10-17

### Patch

- Backoffice: on a phone the section tabs (Overview, Organizations, Activity) now live in the hamburger menu instead of overflowing the top bar.

## 1.1.0 — 2026-10-17

### Minor

- Backoffice organization management: superadmins can create organizations (with a first admin), rename them or change their sign-in slug, suspend and reactivate them, and reset a user's password. They can also sign in as any organization user, with a banner in the app and a button to stop. Every Backoffice action is recorded in a new Aktivnost log, including each change made while signed in as a user.

## 1.0.0 — 2026-10-17

### Major

- First versioned release. From here on every merged PR carries a `.changeset/` file and bumps this version.
