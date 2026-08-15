---
name: release-versioning
description: Set up or operate Iris's changeset-driven semantic-versioning and release pipeline built from per-PR changeset files under .changesets/, an auto-generated "Release vX.Y.Z" PR that accumulates them and infers the next version, and a gated deploy that fires only when that Release PR merges. Use when adding a changeset to a PR, changing how versions are inferred or the changelog is rendered, wiring the release/deploy workflows, or reproducing this system in another repo.
---

# Changeset-driven semantic versioning and release

Iris ships via a two-hop pipeline so that **merging one PR** is the single action
that cuts a version and deploys:

```
feature PR (+ .changesets/*.md)  ──merge──▶  main
        │                                     │  release.yml recomputes
        │                                     ▼
        │                          "Release vX.Y.Z" PR (auto, regenerated)
        │                                     │  human merges it
        ▼                                     ▼
   nothing deploys                 tag vX.Y.Z → GitHub Release → deploy.yml
```

## Moving parts

| File | Role |
| --- | --- |
| `VERSION` | Source of truth, plain `MAJOR.MINOR.PATCH`. |
| `.changesets/*.md` | One per behaviour-changing PR: `type: patch\|minor\|major` frontmatter + a changelog line. `README.md` and `CHANGESET_TEMPLATE.md` are ignored. |
| `scripts/release/version.mjs` | No-dependency engine: `next` prints `{current,next,bump,count}` JSON; `apply` bumps `VERSION`, prepends `CHANGELOG.md`, bumps the frontend `package.json` versions, and deletes consumed changesets. |
| `scripts/release/version.test.mjs` | `node --test` unit tests for the pure logic (bump/resolve/parse/render). |
| `.github/workflows/ci.yml` | Runs Go + web + release-engine tests on every PR and push. The green gate everything else assumes. |
| `.github/workflows/release.yml` | On push to `main`, picks a mode (see below). |
| `.github/workflows/deploy.yml` | Reusable (`workflow_call`) + `workflow_dispatch` only; **never** auto-fires on push. |

## The release.yml decision (the crux)

On every push to `main`, `release.yml` runs `version.mjs next` and branches:

- **pending changesets exist** (`bump != none`) → **mode `pr`**: run `apply` and
  create/update the `release/next` branch + "Release vX.Y.Z" PR (labelled
  `release`). Regenerated on each merge so it always reflects `main`.
- **no changesets, but HEAD changed `VERSION`** → **mode `release`**: the Release
  PR was just merged. Tag `vX.Y.Z`, publish a GitHub Release (notes = newest
  `CHANGELOG.md` section), then call `deploy.yml`.
- **neither** → **mode `none`**: nothing to do.

Detection uses tree state (`git diff HEAD~1 HEAD -- VERSION`), **not** commit
message parsing, so it survives squash/merge/rebase merges.

## Adding a changeset to a PR (the common task)

1. Copy `.changesets/CHANGESET_TEMPLATE.md` to `.changesets/<short-slug>.md`.
2. Set `type` to the semver intent (**highest** wins across the release):
   - `major`: breaking API/contract change (e.g. removing a `WorkOrder` field).
   - `minor`: backward-compatible feature (new endpoint, new column).
   - `patch`: bug fix, copy tweak, internal-only change with user-visible effect.
3. Write the body as the changelog line (Serbian or English, one idea).
4. Commit it with the PR. Docs/CI/pure-refactor PRs need **no** changeset.

Verify locally: `node scripts/release/version.mjs next` should show your bump.

## Operating rules

- **Never hand-edit** `VERSION`, `CHANGELOG.md`, or the Release PR; `apply`
  owns them. Editing `VERSION` in a feature PR will be misread as a release.
- Because the Release PR is opened by `GITHUB_TOKEN`, CI does not re-run on it by
  default. If you want CI on the Release PR, give `peter-evans/create-pull-request`
  a PAT (`token:` input) instead of the default token.
- `build.yml` (GHCR image publish) is independent and still runs on every push to
  `main`; it also tags images `:X.Y.Z` when the `vX.Y.Z` tag is pushed by
  `release.yml`. The Hetzner deploy builds from source and does not pull GHCR.

## Reproducing this system in another repo

1. Add `VERSION` (start `0.1.0`) and `.changesets/` with a `README.md` +
   `CHANGESET_TEMPLATE.md`.
2. Copy `scripts/release/version.mjs`; adjust `PACKAGE_FILES` and any
   surface-specific version files, and keep it dependency-free.
3. Copy `ci.yml`, `release.yml`, `deploy.yml`. Make deploy reusable and remove
   its push trigger. In `release.yml` set `permissions: contents: write,
   pull-requests: write`.
4. Confirm the mode detection matches your merge strategy (tree diff on the
   version file is merge-strategy agnostic).
5. Add a changeset for the versioning change itself and open the first Release PR.
