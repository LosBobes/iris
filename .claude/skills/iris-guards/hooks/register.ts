import type { EngineInterface, Register } from 'claude-code'

import { checksFor, contractDrift, isContractFile, isGitPush, prodRulesFor, tail } from './rules'

const CHECK_TIMEOUT_MS = 10 * 60 * 1000

type Git = { root: string; lines: (args: string[]) => Promise<string[]> }

/** The repository the session works in, or undefined outside a git checkout. */
const openGit = async ($: EngineInterface): Promise<Git | undefined> => {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return undefined

  const root = top.stdout.trim()
  const lines = async (args: string[]) => {
    const ran = await $.process.run(['git', '-C', root, ...args])
    return ran.exitCode === 0 ? ran.stdout.split('\n').filter(Boolean) : []
  }

  return { root, lines }
}

/** Where this branch forked from main: origin/main's merge base, else HEAD. */
const baseOf = async (git: Git): Promise<string> => {
  const [base] = await git.lines(['merge-base', 'HEAD', 'origin/main'])
  return base ?? 'HEAD'
}

/** Every path this branch changes, committed or not, untracked included. */
const branchChanges = async (git: Git): Promise<string[]> => {
  const base = await baseOf(git)
  const diffed = await git.lines(['diff', '--name-only', base])
  const untracked = await git.lines(['ls-files', '--others', '--exclude-standard'])
  return [...new Set([...diffed, ...untracked])]
}

const relativeTo = (root: string, path: string): string =>
  path.startsWith(root + '/') ? path.slice(root.length + 1) : path

const driftNote = (gaps: string[]): string =>
  [
    'iris-guards: the contract-sync rule (CLAUDE.md) looks unbalanced on this branch:',
    ...gaps.map(gap => `- ${gap}`),
    'Apply the shape change across openapi.yaml, domain/types.go, the store, apps/web/src/types/ and fixtures, or say why one surface is deliberately untouched.',
  ].join('\n')

// Set when a contract file is edited, so turn.complete re-checks only then.
let touchedContract = false
// The person's latest prompt, which the production guard reads for consent.
let lastPrompt = ''

type ToolCallAnswer = Awaited<ReturnType<EngineInterface['tool']['call']>>

/** An edit's result, with a drift note for the model when it left a gap. */
const afterEdit = async ($: EngineInterface, filePath: string, ran: ToolCallAnswer): Promise<ToolCallAnswer> => {
  if (ran.deny !== undefined || ran.isError === true) return ran

  const git = await openGit($)
  if (git === undefined || !isContractFile(relativeTo(git.root, filePath))) return ran

  touchedContract = true
  const gaps = contractDrift(await branchChanges(git))
  if (gaps.length === 0) return ran

  return { ...ran, context: [...(ran.context ?? []), driftNote(gaps)] }
}

export const register: Register = on => {

  on('prompt.submit', ($, e, next) => {
    if (!e.isMeta && e.command === undefined) {
      lastPrompt = e.text
      touchedContract = false
    }
    return next(e)
  })

  // 1. Contract drift: after an edit to a contract file, tell the model what
  //    the other surfaces are missing.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => afterEdit($, e.file_path, await next(e)))
    .catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Write' }, async ($, e, next) => afterEdit($, e.file_path, await next(e)))
    .catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || !touchedContract) return done

    touchedContract = false
    const git = await openGit($)
    const gaps = git === undefined ? [] : contractDrift(await branchChanges(git))
    if (gaps.length > 0) {
      $.ui.toast(`Contract drift: ${gaps.length} surface gap${gaps.length === 1 ? '' : 's'} (see openapi/domain/web types)`)
    }
    return done
  })

  // 2. Pre-push gate: run the changed surfaces' checks; a failure stops the push.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!isGitPush(e.command)) return next(e)

    const git = await openGit($)
    if (git === undefined) return next(e)

    const base = await baseOf(git)
    const changed = await git.lines(['diff', '--name-only', base, 'HEAD'])
    const failures: string[] = []

    for (const check of checksFor(changed)) {
      $.ui.status(`iris-guards: ${check.label} (${check.cwd})`)
      const cwd = `${git.root}/${check.cwd}`
      try {
        const ran = await $.process.run(check.argv, { cwd, timeoutMs: CHECK_TIMEOUT_MS })
        // gofmt -l exits 0 and lists unformatted files instead of failing.
        const listsFiles = check.argv[0] === 'gofmt' && ran.stdout.trim() !== ''
        if (ran.exitCode !== 0 || listsFiles) {
          failures.push(`## ${check.label} in ${check.cwd} (exit ${ran.exitCode})\n${tail(ran.stdout + '\n' + ran.stderr)}`)
        }
      } catch (error) {
        failures.push(`## ${check.label} in ${check.cwd} could not run: ${String(error)}`)
      }
    }
    $.ui.status(undefined)

    if (failures.length > 0) {
      return {
        deny: [
          'iris-guards blocked this push: there is no CI and main auto-deploys, so the changed surfaces must pass their checks first.',
          ...failures,
          'Fix these (run `npm install` in apps/web if dependencies are missing), then push again.',
        ].join('\n\n'),
      }
    }
    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'iris-guards: the pre-push check gate failed to run; run the per-surface checks by hand.' },
  )

  // 3. Production guard: commands that reach the server or discard work need
  //    the person's own ask in their latest prompt, and then their approval.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e.input as { command?: unknown }).command
    if (typeof command !== 'string') return next(e)

    const rules = prodRulesFor(command)
    if (rules.length === 0) return next(e)

    const unasked = rules.filter(rule => !rule.askedFor.test(lastPrompt))
    if (unasked.length > 0) {
      return {
        decision: 'deny',
        reason: `iris-guards: this is ${unasked.map(rule => rule.name).join('; ')}, and the user has not asked for it. Ask the user before running it.`,
      }
    }

    const verdict = await next(e)
    return verdict.decision === 'deny'
      ? verdict
      : { decision: 'ask', reason: `iris-guards: ${rules.map(rule => rule.name).join('; ')}. Confirm it should run.` }
  }).catch(() => ({ decision: 'deny', reason: 'iris-guards: the production guard failed; refusing to be safe.' }))
}
