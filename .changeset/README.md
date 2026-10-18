# Changesets

Every pull request adds one Markdown file here describing what it changes and
which [semantic version](https://semver.org) level that is. CI rejects a PR
without one (see `.github/workflows/changeset-check.yml`).

```md
---
bump: minor
---
Work orders can now be duplicated from the detail page.
```

| `bump` | Use when |
| --- | --- |
| `patch` | Bug fix, copy tweak, internal change with no new behavior |
| `minor` | New feature or option, backwards compatible |
| `major` | Breaking change: removed/renamed API fields or routes, data migrations that need manual steps, changed workflows users rely on |

Create one with:

```bash
node scripts/changeset.mjs add minor "Work orders can now be duplicated from the detail page."
node scripts/changeset.mjs status   # pending changesets and the next version
```

When the PR merges to `main`, the release job in `.github/workflows/build.yml`
runs `node scripts/changeset.mjs apply`: the highest level among the pending
changesets bumps the root `VERSION` file, their text is added to
`CHANGELOG.md`, the files here are deleted, and the result is committed and
tagged `vX.Y.Z`. The web app shows `VERSION` on the login screen, and the
Docker images are tagged with it.

A PR that should not produce a release (e.g. CI config only) can carry the
`skip-changeset` label instead.
