import i18n from '@/i18n'

/** Number-format locale for the active UI language (Serbian is the default). */
export function chartLocale(): string {
  return i18n.language?.startsWith('en') ? 'en-US' : 'sr-RS'
}

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(kind: 'full' | 'compact'): Intl.NumberFormat {
  const locale = chartLocale()
  const key = `${kind}:${locale}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter =
      kind === 'full'
        ? new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'RSD',
            maximumFractionDigits: 0,
          })
        : new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'RSD',
            notation: 'compact',
            maximumFractionDigits: 1,
          })
    formatterCache.set(key, formatter)
  }
  return formatter
}

/** Full RSD amount, e.g. "12.000 RSD" (no decimals). */
export function formatRsd(value: number): string {
  return getFormatter('full').format(value)
}

/** Compact RSD amount for tight spaces, e.g. "12 hilj. RSD". */
export function formatRsdCompact(value: number): string {
  return getFormatter('compact').format(value)
}

/** Margin as a percentage of revenue, e.g. "35%". Returns "—" when revenue is 0. */
export function formatMarginPct(profit: number, revenue: number): string {
  if (revenue <= 0) return '—'
  return `${Math.round((profit / revenue) * 100)}%`
}
