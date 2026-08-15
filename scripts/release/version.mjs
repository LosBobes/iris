#!/usr/bin/env node
// Iris release-versioning engine.
//
// Reads the accumulated changeset files under .changes/, infers the highest
// semver bump requested across them, and either prints the next version or
// applies a release (bumps VERSION, prepends CHANGELOG.md, bumps the frontend
// package.json versions, and removes the consumed changesets).
//
// No third-party dependencies — runs with the Node that ships on GitHub's
// ubuntu-latest runners.
//
// Usage:
//   node scripts/release/version.mjs next    # print JSON: {current,next,bump,count}
//   node scripts/release/version.mjs apply    # write the release to the tree
//
// A changeset is a Markdown file in .changes/ with YAML-ish frontmatter:
//   ---
//   type: patch | minor | major
//   ---
//   Human-readable summary of the change (one or more lines).
//
// README.md and CHANGESET_TEMPLATE.md in .changes/ are ignored.

import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CHANGES_DIR = join(ROOT, '.changesets')
const VERSION_FILE = join(ROOT, 'VERSION')
const CHANGELOG_FILE = join(ROOT, 'CHANGELOG.md')
const PACKAGE_FILES = ['apps/web/package.json', 'apps/desktop/package.json']
const IGNORED = new Set(['README.md', 'CHANGESET_TEMPLATE.md'])
const RANK = { patch: 1, minor: 2, major: 3 }

function readVersion() {
  const raw = readFileSync(VERSION_FILE, 'utf8').trim()
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw)
  if (!m) throw new Error(`VERSION is not semver: "${raw}"`)
  return { major: +m[1], minor: +m[2], patch: +m[3], raw }
}

export function bumpVersion(v, bump) {
  if (bump === 'major') return `${v.major + 1}.0.0`
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`
  return `${v.major}.${v.minor}.${v.patch + 1}`
}

// Parse a changeset file into { type, summary }. Throws on a malformed type.
export function parseChangeset(file, text) {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text)
  if (!m) throw new Error(`${file}: missing frontmatter (--- type: ... ---)`)
  const typeMatch = /type:\s*(\w+)/i.exec(m[1])
  const type = typeMatch ? typeMatch[1].toLowerCase() : ''
  if (!RANK[type]) {
    throw new Error(`${file}: "type" must be patch, minor, or major (got "${type}")`)
  }
  return { type, summary: m[2].trim() }
}

function loadChangesets() {
  if (!existsSync(CHANGES_DIR)) return []
  return readdirSync(CHANGES_DIR)
    .filter((f) => f.endsWith('.md') && !IGNORED.has(f))
    .sort()
    .map((f) => {
      const path = join(CHANGES_DIR, f)
      return { file: f, path, ...parseChangeset(f, readFileSync(path, 'utf8')) }
    })
}

// Highest-ranked bump across all pending changesets, or null when none pend.
export function resolveBump(changesets) {
  let best = null
  for (const c of changesets) {
    if (!best || RANK[c.type] > RANK[best]) best = c.type
  }
  return best
}

function computeNext() {
  const current = readVersion()
  const changesets = loadChangesets()
  const bump = resolveBump(changesets)
  return {
    current: current.raw,
    next: bump ? bumpVersion(current, bump) : current.raw,
    bump: bump ?? 'none',
    count: changesets.length,
    changesets,
  }
}

export function renderChangelogSection(version, changesets) {
  const date = new Date().toISOString().slice(0, 10)
  const groups = { major: [], minor: [], patch: [] }
  for (const c of changesets) groups[c.type].push(c.summary)
  const labels = { major: 'Major', minor: 'Minor', patch: 'Patch' }
  let out = `## ${version} - ${date}\n\n`
  for (const type of ['major', 'minor', 'patch']) {
    if (!groups[type].length) continue
    out += `### ${labels[type]}\n\n`
    for (const summary of groups[type]) {
      const [first, ...rest] = summary.split('\n')
      out += `- ${first.trim()}\n`
      for (const line of rest) if (line.trim()) out += `  ${line.trim()}\n`
    }
    out += '\n'
  }
  return out
}

function apply() {
  const info = computeNext()
  if (info.bump === 'none') {
    console.error('No pending changesets — nothing to release.')
    process.exit(1)
  }

  // 1. VERSION
  writeFileSync(VERSION_FILE, `${info.next}\n`)

  // 2. CHANGELOG.md (prepend newest section under the title)
  const section = renderChangelogSection(info.next, info.changesets)
  const header = '# Changelog\n\n'
  let existing = existsSync(CHANGELOG_FILE) ? readFileSync(CHANGELOG_FILE, 'utf8') : header
  if (!existing.startsWith(header)) existing = header + existing
  const body = existing.slice(header.length)
  writeFileSync(CHANGELOG_FILE, header + section + body)

  // 3. Frontend package.json versions (best-effort; keeps surfaces aligned)
  for (const rel of PACKAGE_FILES) {
    const path = join(ROOT, rel)
    if (!existsSync(path)) continue
    const pkg = JSON.parse(readFileSync(path, 'utf8'))
    pkg.version = info.next
    writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
  }

  // 4. Consume the changesets
  for (const c of info.changesets) rmSync(c.path)

  console.log(`Released ${info.current} -> ${info.next} (${info.bump}, ${info.count} changeset(s))`)
}

// CLI dispatch — only when run directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2]
  if (cmd === 'next') {
    const info = computeNext()
    delete info.changesets
    console.log(JSON.stringify(info))
  } else if (cmd === 'apply') {
    apply()
  } else {
    console.error('Usage: version.mjs <next|apply>')
    process.exit(2)
  }
}
