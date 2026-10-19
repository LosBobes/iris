import { describe, expect, it } from 'vitest'
import { checkSellerIdentity, normalizeBankAccount, normalizeSellerIdentity, SELLER_MESSAGES } from './seller-identity'
import type { SellerIdentity } from '@/types/settings'

const valid: SellerIdentity = {
  legalName: ' Primer d.o.o. ',
  pib: '101234569',
  mb: '12345678',
  street: 'Bulevar oslobođenja 1',
  city: 'Novi Sad',
  postalCode: '21000',
  countryCode: 'rs',
  bankAccount: '160-12345-67',
  vatPayer: true,
  email: '  ',
}

describe('normalizeBankAccount', () => {
  it.each([
    ['160-0000000012345-67', '160-0000000012345-67'],
    ['160000000001234567', '160-0000000012345-67'],
    [' 160-12345-67 ', '160-0000000012345-67'],
  ])('formats %s', (raw, want) => {
    expect(normalizeBankAccount(raw)).toBe(want)
  })

  it.each(['', '160-12345', '16000000000123456', '160-00000000000012345-67', '160--67'])('rejects %j', (raw) => {
    expect(normalizeBankAccount(raw)).toBeNull()
  })
})

describe('checkSellerIdentity (mirrors the API)', () => {
  it('normalizes a valid identity', () => {
    expect(normalizeSellerIdentity(valid)).toEqual({
      ...valid,
      legalName: 'Primer d.o.o.',
      countryCode: 'RS',
      bankAccount: '160-0000000012345-67',
      email: null,
    })
  })

  it.each<[string, Partial<SellerIdentity>, keyof SellerIdentity, string]>([
    ['empty name', { legalName: ' ' }, 'legalName', SELLER_MESSAGES.legalName],
    ['bad PIB checksum', { pib: '101234568' }, 'pib', SELLER_MESSAGES.pib],
    ['short MB', { mb: '1234567' }, 'mb', SELLER_MESSAGES.mb],
    ['no city', { city: '' }, 'city', SELLER_MESSAGES.address],
    ['Serbian postal code', { postalCode: '2100' }, 'postalCode', SELLER_MESSAGES.postalCode],
    ['country code', { countryCode: 'SRB' }, 'countryCode', SELLER_MESSAGES.countryCode],
    ['account', { bankAccount: '16-12345-67' }, 'bankAccount', SELLER_MESSAGES.bankAccount],
    ['e-mail', { email: 'racuni.primer.rs' }, 'email', SELLER_MESSAGES.email],
  ])('reports %s', (_name, change, field, message) => {
    expect(checkSellerIdentity({ ...valid, ...change }).problem).toEqual({ field, message })
  })

  it('accepts any postal code abroad', () => {
    expect(checkSellerIdentity({ ...valid, countryCode: 'DE', postalCode: 'D-10115' }).problem).toBeNull()
  })
})
