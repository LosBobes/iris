import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const ROOT = '/repo'

/** Answers `$.process.run` the way git and the checks would in a repo. */
const fakeProcess = (
  on: On,
  changed: string[],
  failing: string[] = [],
) => {
  const ran: string[] = []
  on('process.run', ($, e) => {
    const argv = e.argv.join(' ')
    ran.push(argv)
    const ok = (stdout: string, exitCode = 0) => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })

    if (argv === 'git rev-parse --show-toplevel') return ok(ROOT + '\n')
    if (argv.includes('merge-base')) return ok('abc123\n')
    if (argv.includes('diff --name-only')) return ok(changed.join('\n'))
    if (argv.includes('ls-files')) return ok('')
    if (failing.includes(argv)) return ok('FAIL some test', 1)
    return ok('')
  })
  return ran
}

test('a push whose checks fail is denied with the failure', async ($, on) => {
  const ran = fakeProcess(on, ['iris-api/internal/api/router.go'], ['go test ./...'])
  on('tool.call', () => ({ result: { stdout: 'pushed', stderr: '', interrupted: false } }) as never)

  const answer = await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature' } as never)

  expect(answer.deny).toContain('go test ./...')
  expect(answer.deny).toContain('FAIL some test')
  expect(ran).toContain('go vet ./...')
})

test('a push of docs only runs no checks and goes through', async ($, on) => {
  const ran = fakeProcess(on, ['docs/DECISIONS.md'])
  let pushed = false
  on('tool.call', () => {
    pushed = true
    return { result: { stdout: 'pushed', stderr: '', interrupted: false } } as never
  })

  const answer = await $.tool.call({ tool: 'Bash', command: 'git push' } as never)

  expect(answer.deny).toBeUndefined()
  expect(pushed).toBe(true)
  expect(ran.some(argv => argv.startsWith('npm') || argv.startsWith('go '))).toBe(false)
})

test('a production command the user did not ask for is denied', async $ => {
  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'make deploy' } })

  expect(verdict.decision).toBe('deny')
  expect(verdict.reason).toContain('has not asked')
})

test('an ordinary command is left to the normal permission rules', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'go test ./...' } })

  expect(verdict.decision).toBe('allow')
})

test('editing openapi.yaml alone tells the model what else to update', async ($, on) => {
  fakeProcess(on, ['iris-api/openapi.yaml'])
  on('tool.call', () => ({ result: { type: 'update', filePath: `${ROOT}/iris-api/openapi.yaml` } }) as never)

  const answer = await $.tool.call({
    tool: 'Edit',
    file_path: `${ROOT}/iris-api/openapi.yaml`,
    old_string: 'a',
    new_string: 'b',
  } as never)

  expect(answer.context?.[0]).toContain('contract-sync rule')
  expect(answer.context?.[0]).toContain('apps/web/src/types/')
})

test('editing a page file adds no note', async ($, on) => {
  fakeProcess(on, ['iris-api/openapi.yaml'])
  on('tool.call', () => ({ result: { type: 'update', filePath: `${ROOT}/apps/web/src/App.tsx` } }) as never)

  const answer = await $.tool.call({
    tool: 'Edit',
    file_path: `${ROOT}/apps/web/src/App.tsx`,
    old_string: 'a',
    new_string: 'b',
  } as never)

  expect(answer.context).toBeUndefined()
})
