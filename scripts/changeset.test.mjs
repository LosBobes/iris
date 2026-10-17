// Run with: node --test scripts/changeset.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bumpVersion, parseChangeset, renderEntry } from './changeset.mjs'

test('bumpVersion resets lower components', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4')
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0')
  assert.throws(() => bumpVersion('1.2', 'patch'))
})

test('parseChangeset reads the level and plain-text summary', () => {
  assert.deepEqual(parseChangeset('---\nbump: Minor\n---\nAdded duplication.\n'), {
    bump: 'minor',
    summary: 'Added duplication.',
  })
  assert.throws(() => parseChangeset('Added duplication.'), /front matter/)
  assert.throws(() => parseChangeset('---\nbump: huge\n---\nx'), /bump must be/)
  assert.throws(() => parseChangeset('---\nbump: patch\n---\n\n'), /describe the change/)
})

test('renderEntry groups changes by level, highest first', () => {
  const entry = renderEntry('1.1.0', '2026-10-17', [
    { bump: 'patch', summary: 'Fixed rounding.' },
    { bump: 'minor', summary: 'Added export.\nWith CSV.' },
  ])
  assert.equal(
    entry,
    '## 1.1.0 — 2026-10-17\n\n### Minor\n\n- Added export.\n  With CSV.\n\n### Patch\n\n- Fixed rounding.\n',
  )
})
