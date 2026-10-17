# Changelog

All notable changes to Iris. Generated from `.changeset/` files on merge to main; do not edit released entries by hand.

## 1.1.0 — 2026-10-17

### Minor

- Backoffice organization management: superadmins can create organizations (with a first admin), rename them or change their sign-in slug, suspend and reactivate them, and reset a user's password. They can also sign in as any organization user, with a banner in the app and a button to stop. Every Backoffice action is recorded in a new Aktivnost log, including each change made while signed in as a user.

## 1.0.0 — 2026-10-17

### Major

- First versioned release. From here on every merged PR carries a `.changeset/` file and bumps this version.
