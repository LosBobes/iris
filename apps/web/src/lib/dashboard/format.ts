const rsd = new Intl.NumberFormat('sr-RS', {
  style: 'currency',
  currency: 'RSD',
  maximumFractionDigits: 0,
})

const rsdCompact = new Intl.NumberFormat('sr-RS', {
  style: 'currency',
  currency: 'RSD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Full RSD amount, e.g. "12.000 RSD" (no decimals). */
export function formatRsd(value: number): string {
  return rsd.format(value)
}

/** Compact RSD amount for tight spaces, e.g. "12 hilj. RSD". */
export function formatRsdCompact(value: number): string {
  return rsdCompact.format(value)
}

/** Margin as a percentage of revenue, e.g. "35%". Returns "—" when revenue is 0. */
export function formatMarginPct(profit: number, revenue: number): string {
  if (revenue <= 0) return '—'
  return `${Math.round((profit / revenue) * 100)}%`
}
