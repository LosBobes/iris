# Changelog

All notable changes to Iris. Generated from `.changeset/` files on merge to main; do not edit released entries by hand.

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
