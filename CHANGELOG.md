# Changelog

All notable changes to Iris. Generated from `.changeset/` files on merge to main; do not edit released entries by hand.

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
