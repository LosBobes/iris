# Changelog

All notable changes to Iris. Generated from `.changeset/` files on merge to main; do not edit released entries by hand.

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
