import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bumpVersion,
  resolveBump,
  parseChangeset,
  renderChangelogSection,
} from './version.mjs'

const V = { major: 1, minor: 2, patch: 3 }

test('bumpVersion applies semver rules', () => {
  assert.equal(bumpVersion(V, 'patch'), '1.2.4')
  assert.equal(bumpVersion(V, 'minor'), '1.3.0')
  assert.equal(bumpVersion(V, 'major'), '2.0.0')
})

test('resolveBump takes the highest bump present', () => {
  assert.equal(resolveBump([]), null)
  assert.equal(resolveBump([{ type: 'patch' }, { type: 'patch' }]), 'patch')
  assert.equal(resolveBump([{ type: 'patch' }, { type: 'minor' }]), 'minor')
  assert.equal(resolveBump([{ type: 'minor' }, { type: 'major' }, { type: 'patch' }]), 'major')
})

test('parseChangeset reads type and summary', () => {
  const cs = parseChangeset('x.md', '---\ntype: minor\n---\nAdd a column.\n')
  assert.equal(cs.type, 'minor')
  assert.equal(cs.summary, 'Add a column.')
})

test('parseChangeset rejects missing frontmatter and bad type', () => {
  assert.throws(() => parseChangeset('x.md', 'no frontmatter here'))
  assert.throws(() => parseChangeset('x.md', '---\ntype: huge\n---\nnope'))
})

test('renderChangelogSection groups by type in severity order', () => {
  const out = renderChangelogSection('1.3.0', [
    { type: 'patch', summary: 'Fix a bug.' },
    { type: 'minor', summary: 'New feature.' },
  ])
  assert.match(out, /^## 1\.3\.0 - \d{4}-\d{2}-\d{2}/)
  // Minor section must render before Patch section.
  assert.ok(out.indexOf('### Minor') < out.indexOf('### Patch'))
  assert.match(out, /- New feature\./)
  assert.match(out, /- Fix a bug\./)
})
