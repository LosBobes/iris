import { describe, expect, it } from 'vitest'
import { isValidMb, isValidPib } from '@/lib/serbian-id'

describe('isValidPib', () => {
  it('accepts real PIBs from the Čobanović data set', () => {
    for (const pib of ['100197914', '104791823', '100395235']) {
      expect(isValidPib(pib)).toBe(true)
    }
  })

  it('rejects wrong length, non-digits and bad control digit', () => {
    for (const pib of ['', '12345678', '1234567890', '123456789', '10019791x']) {
      expect(isValidPib(pib)).toBe(false)
    }
  })
})

describe('isValidMb', () => {
  it('accepts any 8-digit value (format only)', () => {
    for (const mb of ['53671888', '20240873', '00000000']) {
      expect(isValidMb(mb)).toBe(true)
    }
  })

  it('rejects wrong length or non-digits', () => {
    for (const mb of ['', '1234567', '123456789', '5367188x']) {
      expect(isValidMb(mb)).toBe(false)
    }
  })
})
