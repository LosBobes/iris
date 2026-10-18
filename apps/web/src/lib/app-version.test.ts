import { describe, expect, it } from 'vitest'
import { formatVersion, isVersionMismatch } from './app-version'

describe('app version', () => {
  it('formats semver with a v prefix and leaves other values alone', () => {
    expect(formatVersion('2.3.0')).toBe('v2.3.0')
    expect(formatVersion('dev')).toBe('dev')
    expect(formatVersion('')).toBe('—')
    expect(formatVersion(undefined)).toBe('—')
  })

  it('flags only two different releases as a mismatch', () => {
    expect(isVersionMismatch('2.3.0', '2.4.0')).toBe(true)
    expect(isVersionMismatch('2.3.0', '2.3.0')).toBe(false)
    expect(isVersionMismatch('2.3.0', 'dev')).toBe(false)
    expect(isVersionMismatch('dev', '2.3.0')).toBe(false)
    expect(isVersionMismatch('2.3.0', '')).toBe(false)
  })
})
