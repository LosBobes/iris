// Pure rules for the Iris guards: no `$`, so the tests can call them directly.

// --- Contract drift -------------------------------------------------------

const OPENAPI = 'iris-api/openapi.yaml'
const GO_DOMAIN = /^iris-api\/internal\/domain\/(types|enums)\.go$/
const GO_STORE = /^iris-api\/internal\/store\/.+\.go$/
const WEB_TYPES = /^apps\/web\/src\/types\/[^/]+\.ts$/

/** True when a repo-relative path is one of the shared contract files. */
export const isContractFile = (path: string): boolean =>
  path === OPENAPI || GO_DOMAIN.test(path) || WEB_TYPES.test(path)

/**
 * The contract-sync gaps in a set of changed repo-relative paths: one line per
 * surface that changed without its counterpart. Empty when consistent.
 */
export const contractDrift = (changed: readonly string[]): string[] => {
  const openapi = changed.includes(OPENAPI)
  const domain = changed.some(p => GO_DOMAIN.test(p))
  const store = changed.some(p => GO_STORE.test(p) && !p.endsWith('_test.go'))
  const web = changed.some(p => WEB_TYPES.test(p))
  const gaps: string[] = []

  if (openapi && !domain) {
    gaps.push(`${OPENAPI} changed but iris-api/internal/domain/types.go did not.`)
  }
  if (domain && !openapi) {
    gaps.push(`iris-api/internal/domain/ changed but ${OPENAPI} did not.`)
  }
  if ((openapi || domain) && !web) {
    gaps.push('The API contract changed but nothing in apps/web/src/types/ did.')
  }
  if (web && !openapi && !domain) {
    gaps.push(`apps/web/src/types/ changed but neither ${OPENAPI} nor the Go domain types did.`)
  }
  if (domain && !store) {
    gaps.push(
      'Go domain types changed but iris-api/internal/store/ did not: if the field is persisted it needs the store and migrations.go (settings in app_settings need no migration).',
    )
  }

  return gaps
}

// --- Pre-push gate --------------------------------------------------------

/** True when a shell command runs `git push` (not merely mentions it). */
export const isGitPush = (command: string): boolean =>
  /(^|[;&|(]\s*|\bthen\s+|\bdo\s+)(\S+=\S+\s+)*git(\s+-C\s+\S+)?\s+push\b/m.test(command) &&
  !/\bgit\s+push\b[^;&|]*--dry-run\b/.test(command)

export type Check = { label: string; cwd: string; argv: string[] }

/** The per-surface checks a push of these changed paths must pass first. */
export const checksFor = (changed: readonly string[]): Check[] => {
  const checks: Check[] = []

  if (changed.some(p => p.startsWith('iris-api/'))) {
    checks.push(
      { label: 'gofmt -l', cwd: 'iris-api', argv: ['gofmt', '-l', '.'] },
      { label: 'go vet ./...', cwd: 'iris-api', argv: ['go', 'vet', './...'] },
      { label: 'go test ./...', cwd: 'iris-api', argv: ['go', 'test', './...'] },
    )
  }
  if (changed.some(p => p.startsWith('apps/web/'))) {
    checks.push(
      { label: 'npm run lint', cwd: 'apps/web', argv: ['npm', 'run', 'lint'] },
      { label: 'npm test', cwd: 'apps/web', argv: ['npm', 'test'] },
      { label: 'npm run build', cwd: 'apps/web', argv: ['npm', 'run', 'build'] },
    )
  }

  return checks
}

/** The last `lines` lines of a check's output, for the model to read. */
export const tail = (text: string, lines = 40): string =>
  text.trimEnd().split('\n').slice(-lines).join('\n')

// --- Production guard -----------------------------------------------------

export type ProdRule = { name: string; command: RegExp; askedFor: RegExp }

/**
 * Commands that reach the production server or discard work, each paired with
 * the words that show the person asked for it in their latest prompt.
 */
export const PROD_RULES: readonly ProdRule[] = [
  {
    name: 'a production deploy or server access (make deploy/ssh/logs/db-pull)',
    command: /\bmake\s+(\S+\s+)*(deploy|ssh|logs|db-pull)\b/,
    askedFor: /\b(deploy|roll ?back|release|ssh|server|logs?|db-pull|backup|prod(uction)?)\b/i,
  },
  {
    name: 'an ssh/scp session to a remote host',
    command: /(^|[;&|(]\s*)(\S+=\S+\s+)*(ssh|scp|rsync)\s+\S/m,
    askedFor: /\b(ssh|scp|rsync|server|hetzner|prod(uction)?)\b/i,
  },
  {
    name: 'docker compose against docker-compose.prod.yml',
    command: /\bdocker(-compose|\s+compose)\b[^;&|]*docker-compose\.prod\.yml/,
    askedFor: /\b(prod(uction)?|deploy|docker)\b/i,
  },
  {
    name: 'a hard reset that discards local work (git reset --hard)',
    command: /\bgit\s+(\S+\s+)*reset\s+(\S+\s+)*--hard\b/,
    askedFor: /\b(reset|discard|throw away|start over)\b/i,
  },
  {
    name: 'a force push',
    command: /\bgit\s+(\S+\s+)*push\b[^;&|]*(\s--force(-with-lease)?\b|\s-f\b)/,
    askedFor: /\bforce\b/i,
  },
  {
    name: 'a push straight to main (which deploys)',
    command: /\bgit\s+(\S+\s+)*push\s+(\S+\s+)*(\S+:)?(refs\/heads\/)?main(?=$|\s|[;&|)])/m,
    askedFor: /\b(push|merge)\b[^.]*\bmain\b|\bmain\b[^.]*\bpush\b/i,
  },
  {
    name: 'a manual deploy workflow run',
    command: /\bgh\s+workflow\s+run\b[^;&|]*deploy/,
    askedFor: /\bdeploy\b/i,
  },
]

/** The production rules a command trips. */
export const prodRulesFor = (command: string): ProdRule[] =>
  PROD_RULES.filter(rule => rule.command.test(command))
