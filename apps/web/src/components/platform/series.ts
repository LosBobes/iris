import type { PlatformDailyPoint, PlatformTenantMetrics } from '@/types/platform'

// Categorical slots for the dark dashboard surface (#1a1b1e), validated with
// the dataviz validator (all checks pass, worst adjacent CVD ΔE 8.4). Fixed
// order, never cycled: a slot belongs to an organization, not to a rank.
export const SERIES_COLORS = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const

export const OTHER_COLOR = '#8a8d93'
export const OTHER_KEY = '__other__'

export interface SeriesDef {
  key: string
  label: string
  color: string
}

/**
 * One series per organization, coloured by its slug's position, so a range
 * change never repaints anyone. Past eight organizations, the busiest seven
 * keep their own colour and the rest fold into "other".
 */
export function buildSeries(tenants: PlatformTenantMetrics[], otherLabel: string): {
  series: SeriesDef[]
  keyFor: (slug: string) => string
} {
  const bySlug = [...tenants].sort((a, b) => a.slug.localeCompare(b.slug))
  if (bySlug.length <= SERIES_COLORS.length) {
    return {
      series: bySlug.map((tenant, index) => ({
        key: tenant.slug,
        label: tenant.name,
        color: SERIES_COLORS[index],
      })),
      keyFor: (slug) => slug,
    }
  }
  const kept = new Set(
    [...tenants]
      .sort((a, b) => b.workOrders - a.workOrders || a.slug.localeCompare(b.slug))
      .slice(0, SERIES_COLORS.length - 1)
      .map((tenant) => tenant.slug),
  )
  const series = bySlug
    .filter((tenant) => kept.has(tenant.slug))
    .map((tenant, index): SeriesDef => ({ key: tenant.slug, label: tenant.name, color: SERIES_COLORS[index] }))
  series.push({ key: OTHER_KEY, label: otherLabel, color: OTHER_COLOR })
  return { series, keyFor: (slug) => (kept.has(slug) ? slug : OTHER_KEY) }
}

export type ChartRow = { date: string } & Record<string, number | string>

/**
 * Pivots the daily points into chart rows for one measure. Long ranges are
 * bucketed by week (the row is labelled with the week's first day) so bars
 * stay readable.
 */
export function buildRows(
  daily: PlatformDailyPoint[],
  measure: 'workOrders' | 'logins',
  series: SeriesDef[],
  keyFor: (slug: string) => string,
  bucketDays: number,
): ChartRow[] {
  const rows: ChartRow[] = []
  daily.forEach((point, index) => {
    if (index % bucketDays === 0) {
      const row: ChartRow = { date: point.date }
      for (const def of series) row[def.key] = 0
      rows.push(row)
    }
    const row = rows[rows.length - 1]
    for (const [slug, count] of Object.entries(point[measure])) {
      const key = keyFor(slug)
      row[key] = (Number(row[key]) || 0) + count
    }
  })
  return rows
}
