import { expect, test } from 'claude-code/testing'

import { checksFor, contractDrift, isGitPush, prodRulesFor } from '../hooks/rules'

test('a balanced contract change has no drift', () => {
  expect(
    contractDrift([
      'iris-api/openapi.yaml',
      'iris-api/internal/domain/types.go',
      'iris-api/internal/store/sqlite.go',
      'apps/web/src/types/work-order.ts',
    ]),
  ).toEqual([])
})

test('an openapi-only change reports the missing Go and web types', () => {
  const gaps = contractDrift(['iris-api/openapi.yaml'])
  expect(gaps.length).toBe(2)
  expect(gaps[0]).toContain('domain/types.go')
  expect(gaps[1]).toContain('apps/web/src/types/')
})

test('a web-types-only change reports the missing API side', () => {
  expect(contractDrift(['apps/web/src/types/settings.ts'])).toEqual([
    'apps/web/src/types/ changed but neither iris-api/openapi.yaml nor the Go domain types did.',
  ])
})

test('unrelated paths have no drift', () => {
  expect(contractDrift(['apps/web/src/pages/Dashboard.tsx', 'README.md'])).toEqual([])
})

test('git push is recognised as a command, not as a mention', () => {
  expect(isGitPush('git push -u origin ccr-1')).toBe(true)
  expect(isGitPush('npm test && git push')).toBe(true)
  expect(isGitPush('git -C iris push origin x')).toBe(true)
  expect(isGitPush('git push --dry-run')).toBe(false)
  expect(isGitPush('echo "remember to git push"')).toBe(false)
  expect(isGitPush('git status')).toBe(false)
})

test('checks follow the changed surfaces', () => {
  expect(checksFor(['docs/DECISIONS.md'])).toEqual([])
  expect(checksFor(['iris-api/cmd/server/main.go']).map(c => c.label)).toEqual([
    'gofmt -l',
    'go vet ./...',
    'go test ./...',
  ])
  expect(checksFor(['apps/web/src/App.tsx']).map(c => c.cwd)).toEqual(['apps/web', 'apps/web', 'apps/web'])
})

test('production commands are recognised', () => {
  const names = (command: string) => prodRulesFor(command).map(rule => rule.name)

  expect(names('make deploy HETZNER_HOST=1.2.3.4').length).toBe(1)
  expect(names('ssh root@1.2.3.4 uptime').length).toBe(1)
  expect(names('docker compose -f docker-compose.prod.yml up -d').length).toBe(1)
  expect(names('git reset --hard origin/main').length).toBe(1)
  expect(names('git push --force origin feature').length).toBe(1)
  expect(names('git push origin main').length).toBe(1)
  expect(names('git push origin HEAD:main').length).toBe(1)

  expect(names('git push -u origin ccr-main-fix')).toEqual([])
  expect(names('git push origin main-fix')).toEqual([])
  expect(names('docker compose up -d')).toEqual([])
  expect(names('make test')).toEqual([])
  expect(names('git reset HEAD~1')).toEqual([])
})
