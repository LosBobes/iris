import { isValidMb, isValidPib } from '@/lib/serbian-id'
import type { SellerIdentity } from '@/types/settings'

// The organization's legal identity for e-invoices and e-dispatch notes
// (D-030). Mirrors iris-api/internal/store/seller_identity.go: the same
// normalization and the same Serbian messages, so fixture mode and the form
// reject exactly what the API rejects.

export const SELLER_MESSAGES = {
  legalName: 'Poslovno ime firme je obavezno.',
  pib: 'PIB firme mora imati 9 cifara sa ispravnom kontrolnom cifrom.',
  mb: 'Matični broj firme mora imati tačno 8 cifara.',
  address: 'Ulica i broj, mesto i poštanski broj firme su obavezni.',
  postalCode: 'Poštanski broj mora imati 5 cifara.',
  countryCode: 'Oznaka države mora imati dva slova (npr. RS).',
  bankAccount: 'Tekući račun mora biti u obliku 123-1234567890123-12.',
  email: 'E-adresa firme nije ispravna.',
  tooLong: 'Podatak o firmi je predugačak.',
} as const

const FIELD_MAX_LENGTH = 200

export const EMPTY_SELLER_IDENTITY: SellerIdentity = {
  legalName: '',
  pib: '',
  mb: '',
  street: '',
  city: '',
  postalCode: '',
  countryCode: 'RS',
  bankAccount: '',
  vatPayer: true,
  email: null,
}

/**
 * Formats a Serbian current account as "BBB-AAAAAAAAAAAAA-CC". Accepts the
 * dashed short form (middle part zero-padded) or 18 digits; null when neither.
 */
export function normalizeBankAccount(raw: string): string | null {
  const compact = raw.trim().replaceAll(' ', '')
  const parts = compact.split('-')
  let bank: string
  let account: string
  let control: string
  if (parts.length === 1) {
    if (compact.length !== 18) return null
    bank = compact.slice(0, 3)
    account = compact.slice(3, 16)
    control = compact.slice(16)
  } else if (parts.length === 3) {
    ;[bank, account, control] = parts as [string, string, string]
    if (account.length === 0 || account.length > 13) return null
    account = account.padStart(13, '0')
  } else {
    return null
  }
  const digits = /^[0-9]+$/
  if (bank.length !== 3 || control.length !== 2 || !digits.test(bank) || !digits.test(account) || !digits.test(control)) {
    return null
  }
  return `${bank}-${account}-${control}`
}

/** Field the first validation problem belongs to, for form error placement. */
export type SellerIdentityField = keyof SellerIdentity

export interface SellerIdentityProblem {
  field: SellerIdentityField
  message: string
}

/**
 * Trims and normalizes the identity, returning it or the first problem (in the
 * API's order).
 */
export function checkSellerIdentity(
  input: SellerIdentity,
): { identity: SellerIdentity; problem: null } | { identity: null; problem: SellerIdentityProblem } {
  const email = input.email?.trim() ? input.email.trim() : null
  const identity: SellerIdentity = {
    legalName: input.legalName.trim(),
    pib: input.pib.trim(),
    mb: input.mb.trim(),
    street: input.street.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim(),
    countryCode: input.countryCode.trim().toUpperCase() || 'RS',
    bankAccount: input.bankAccount,
    vatPayer: input.vatPayer,
    email,
  }
  const fail = (field: SellerIdentityField, message: string) => ({ identity: null, problem: { field, message } }) as const
  for (const field of ['legalName', 'street', 'city', 'postalCode'] as const) {
    if ([...identity[field]].length > FIELD_MAX_LENGTH) return fail(field, SELLER_MESSAGES.tooLong)
  }
  if (!identity.legalName) return fail('legalName', SELLER_MESSAGES.legalName)
  if (!isValidPib(identity.pib)) return fail('pib', SELLER_MESSAGES.pib)
  if (!isValidMb(identity.mb)) return fail('mb', SELLER_MESSAGES.mb)
  if (!identity.street) return fail('street', SELLER_MESSAGES.address)
  if (!identity.city) return fail('city', SELLER_MESSAGES.address)
  if (!identity.postalCode) return fail('postalCode', SELLER_MESSAGES.address)
  if (!/^[A-Z]{2}$/.test(identity.countryCode)) return fail('countryCode', SELLER_MESSAGES.countryCode)
  if (identity.countryCode === 'RS' && !/^[0-9]{5}$/.test(identity.postalCode)) {
    return fail('postalCode', SELLER_MESSAGES.postalCode)
  }
  const account = normalizeBankAccount(identity.bankAccount)
  if (!account) return fail('bankAccount', SELLER_MESSAGES.bankAccount)
  identity.bankAccount = account
  if (email !== null) {
    const at = email.indexOf('@')
    if (at <= 0 || at !== email.lastIndexOf('@') || !email.slice(at + 1).includes('.') || /\s/.test(email) || email.length > FIELD_MAX_LENGTH) {
      return fail('email', SELLER_MESSAGES.email)
    }
  }
  return { identity, problem: null }
}

/** Fixture-mode twin of the API save: the normalized identity, or throws the API's message. */
export function normalizeSellerIdentity(input: SellerIdentity): SellerIdentity {
  const result = checkSellerIdentity(input)
  if (result.problem) throw new Error(result.problem.message)
  return result.identity
}
