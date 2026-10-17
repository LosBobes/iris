#!/usr/bin/env node
// Semantic versioning for Iris.
//
// Every PR adds a changeset: a Markdown file in .changeset/ whose front matter
// names the semver level and whose body describes the change in plain text:
//
//   ---
//   bump: minor
//   ---
//   Work orders can now be duplicated from the detail page.
//
// After a merge to main, CI runs `apply`: the highest level across all pending
// changesets bumps VERSION (major > minor > patch), their text is prepended to
// CHANGELOG.md, and the changeset files are deleted.
//
// Usage (from the repository root):
//   node scripts/changeset.mjs add <patch|minor|major> "Plain-text summary"
//   node scripts/changeset.mjs status          list pending changesets and the next version
//   node scripts/changeset.mjs check [files..] validate changesets (all pending ones by default)
//   node scripts/changeset.mjs apply           bump VERSION, update CHANGELOG.md, delete changesets
//
// Dependency-free on purpose: the repo has no root package.json.

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGESET_DIR = join(ROOT, '.changeset')
const VERSION_FILE = join(ROOT, 'VERSION')
const CHANGELOG_FILE = join(ROOT, 'CHANGELOG.md')
const LEVELS = ['patch', 'minor', 'major']
const CHANGELOG_HEADER = '# Changelog\n\nAll notable changes to Iris. Generated from `.changeset/` files on merge to main; do not edit released entries by hand.\n'

function fail(message) {
  console.error(`changeset: ${message}`)
  process.exit(1)
}

export function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim())
  if (!match) throw new Error(`VERSION must be MAJOR.MINOR.PATCH, got "${text.trim()}"`)
  return match.slice(1).map(Number)
}

export function bumpVersion(version, level) {
  const [major, minor, patch] = parseVersion(version)
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`unknown bump level "${level}"`)
}

export function parseChangeset(source, name = 'changeset') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) throw new Error(`${name}: missing front matter (--- bump: patch|minor|major ---)`)
  const bumpLine = /^bump:\s*["']?(\w+)["']?\s*$/m.exec(match[1])
  if (!bumpLine) throw new Error(`${name}: front matter needs a "bump:" line`)
  const bump = bumpLine[1].toLowerCase()
  if (!LEVELS.includes(bump)) throw new Error(`${name}: bump must be one of ${LEVELS.join(', ')}, got "${bump}"`)
  const summary = match[2].trim()
  if (!summary) throw new Error(`${name}: describe the change below the front matter`)
  return { bump, summary }
}

function pendingFiles() {
  if (!existsSync(CHANGESET_DIR)) return []
  return readdirSync(CHANGESET_DIR)
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .sort()
    .map((file) => join(CHANGESET_DIR, file))
}

function loadChangesets(files) {
  return files.map((file) => ({ file, ...parseChangeset(readFileSync(file, 'utf8'), basename(file)) }))
}

function highestLevel(changesets) {
  return changesets.reduce((top, { bump }) => (LEVELS.indexOf(bump) > LEVELS.indexOf(top) ? bump : top), 'patch')
}

function readVersion() {
  const version = readFileSync(VERSION_FILE, 'utf8').trim()
  parseVersion(version)
  return version
}

export function renderEntry(version, date, changesets) {
  const lines = [`## ${version} — ${date}`, '']
  for (const level of [...LEVELS].reverse()) {
    const items = changesets.filter((changeset) => changeset.bump === level)
    if (items.length === 0) continue
    lines.push(`### ${level[0].toUpperCase()}${level.slice(1)}`, '')
    for (const { summary } of items) {
      lines.push(`- ${summary.split(/\r?\n/).join('\n  ')}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function slugify(text) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'change'
}

function add(level, summary) {
  if (!LEVELS.includes(level)) fail(`usage: add <${LEVELS.join('|')}> "summary"`)
  if (!summary?.trim()) fail('add needs a plain-text summary of the change')
  mkdirSync(CHANGESET_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const file = join(CHANGESET_DIR, `${stamp}-${slugify(summary)}.md`)
  writeFileSync(file, `---\nbump: ${level}\n---\n${summary.trim()}\n`)
  console.log(`created ${file.slice(ROOT.length + 1)}`)
}

function status() {
  const changesets = loadChangesets(pendingFiles())
  const version = readVersion()
  if (changesets.length === 0) {
    console.log(`version ${version}; no pending changesets`)
    return
  }
  for (const { file, bump, summary } of changesets) {
    console.log(`${bump.padEnd(5)}  ${basename(file)}  ${summary.split('\n')[0]}`)
  }
  console.log(`version ${version} -> ${bumpVersion(version, highestLevel(changesets))}`)
}

function check(files) {
  const targets = files.length > 0 ? files.map((file) => resolve(file)) : pendingFiles()
  if (targets.length === 0) fail('no changeset found; add one with: node scripts/changeset.mjs add <patch|minor|major> "summary"')
  try {
    readVersion()
    loadChangesets(targets)
  } catch (error) {
    fail(error.message)
  }
  console.log(`${targets.length} changeset(s) valid`)
}

function apply() {
  const changesets = loadChangesets(pendingFiles())
  const current = readVersion()
  if (changesets.length === 0) {
    console.log(`version=${current}`)
    console.log('changed=false')
    return
  }
  const next = bumpVersion(current, highestLevel(changesets))
  const date = new Date().toISOString().slice(0, 10)
  const existing = existsSync(CHANGELOG_FILE) ? readFileSync(CHANGELOG_FILE, 'utf8') : CHANGELOG_HEADER
  const body = existing.startsWith(CHANGELOG_HEADER) ? existing.slice(CHANGELOG_HEADER.length) : `\n${existing}`
  writeFileSync(CHANGELOG_FILE, `${CHANGELOG_HEADER}\n${renderEntry(next, date, changesets)}${body.replace(/^\n*/, '\n')}`)
  writeFileSync(VERSION_FILE, `${next}\n`)
  for (const { file } of changesets) unlinkSync(file)
  console.log(`version=${next}`)
  console.log('changed=true')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'add') add(args[0], args.slice(1).join(' '))
    else if (command === 'status') status()
    else if (command === 'check') check(args)
    else if (command === 'apply') apply()
    else fail('usage: changeset.mjs <add|status|check|apply>')
  } catch (error) {
    fail(error.message)
  }
}
