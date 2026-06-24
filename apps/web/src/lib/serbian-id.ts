import i18n from '@/i18n'

// Serbian firm identifier validation, mirroring
// iris-api/internal/domain/validation.go so the UI rejects bad input before it
// reaches the API.
//
// PIB (poreski identifikacioni broj): 9 digits with an ISO 7064 MOD 11,10
// control digit. MB (matični broj): exactly 8 digits, no checksum (the real
// data does not follow a consistent control scheme).

function allDigits(value: string): boolean {
  return value.length > 0 && /^[0-9]+$/.test(value)
}

function mod1110ControlOk(value: string): boolean {
  let p = 10
  for (let i = 0; i < value.length - 1; i += 1) {
    let s = (Number(value[i]) + p) % 10
    if (s === 0) s = 10
    p = (s * 2) % 11
  }
  const control = (11 - p) % 10
  return control === Number(value[value.length - 1])
}

export function isValidPib(pib: string): boolean {
  const trimmed = pib.trim()
  return trimmed.length === 9 && allDigits(trimmed) && mod1110ControlOk(trimmed)
}

export function isValidMb(mb: string): boolean {
  const trimmed = mb.trim()
  return trimmed.length === 8 && allDigits(trimmed)
}

export const PIB_ERROR = i18n.t('validation.pibInvalid')
export const MB_ERROR = i18n.t('validation.mbExactly8')
