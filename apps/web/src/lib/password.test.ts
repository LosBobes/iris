import { describe, expect, it } from 'vitest'
import { MAX_PASSWORD_BYTES, isPasswordTooLong, passwordByteLength } from './password'

describe('password byte limit', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(passwordByteLength('abc')).toBe(3)
    expect(passwordByteLength('žđ')).toBe(4)
  })

  it('allows exactly the bcrypt limit and nothing more', () => {
    expect(isPasswordTooLong('a'.repeat(MAX_PASSWORD_BYTES))).toBe(false)
    expect(isPasswordTooLong('a'.repeat(MAX_PASSWORD_BYTES + 1))).toBe(true)
    // 37 two-byte letters are 74 bytes.
    expect(isPasswordTooLong('ž'.repeat(37))).toBe(true)
  })
})
