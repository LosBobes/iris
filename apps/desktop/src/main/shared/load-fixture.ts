import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function resolveFixturePath(fileName: string): string {
  const candidates = [
    join(app.getAppPath(), 'fixtures', fileName),
    join(process.cwd(), 'fixtures', fileName),
  ]

  const match = candidates.find((candidate) => existsSync(candidate))

  if (!match) {
    throw new Error(`Fixture file not found: ${fileName}`)
  }

  return match
}

export function loadFixtureJson<T>(fileName: string): T {
  const filePath = resolveFixturePath(fileName)
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T
}