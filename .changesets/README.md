# Changesets

Every PR that changes shipped behaviour must add **one changeset file** to this
directory. A changeset declares how the change affects the app version and
carries the human-readable line that lands in `CHANGELOG.md`.

## Adding a changeset

Copy `CHANGESET_TEMPLATE.md` to a new file with a short, unique name, e.g.
`.changesets/fix-workorder-null-crash.md`:

```markdown
---
type: patch
---
Fix crash on the work-order details page for legacy null collections.
```

- `type` is one of **`patch`**, **`minor`**, or **`major`** (semver intent).
- The body is the changelog line (Serbian or English; keep it one idea).

## How versions are inferred

On merge to `main`, `.github/workflows/release.yml` runs
`scripts/release/version.mjs`, which:

1. Reads the current version from the root `VERSION` file.
2. Scans every changeset here and takes the **highest** bump
   (`major` > `minor` > `patch`).
3. Opens/updates a single **"Release vX.Y.Z"** PR that bumps `VERSION`,
   prepends the accumulated entries to `CHANGELOG.md`, bumps the frontend
   `package.json` versions, and deletes the consumed changesets.

Merging that Release PR tags `vX.Y.Z`, publishes a GitHub Release, and triggers
the Hetzner deploy. Regular feature PRs never deploy on their own.

A PR with no shipped behaviour change (docs, internal refactors, CI) needs no
changeset. The Release PR simply won't include it.
