const quantityFormatter = new Intl.NumberFormat('sr-Latn', { maximumFractionDigits: 3 })
const signedFormatter = new Intl.NumberFormat('sr-Latn', { maximumFractionDigits: 3, signDisplay: 'exceptZero' })

/** "620 tabak", "12,5 kg" or just the number when the unit is empty. */
export function formatStockQuantity(quantity: number, unit?: string | null): string {
  const value = quantityFormatter.format(quantity)
  return unit?.trim() ? `${value} ${unit.trim()}` : value
}

/** Like formatStockQuantity but always signed ("+10 kom", "-3 kg"). */
export function formatSignedQuantity(quantity: number, unit?: string | null): string {
  const value = signedFormatter.format(quantity)
  return unit?.trim() ? `${value} ${unit.trim()}` : value
}
