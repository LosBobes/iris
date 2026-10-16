import { describe, expect, it } from 'vitest'
import { OTHER_KEY, SERIES_COLORS, buildRows, buildSeries } from './series'
import type { PlatformTenantMetrics } from '@/types/platform'

function tenant(slug: string, workOrders = 0): PlatformTenantMetrics {
  return {
    id: `tenant-${slug}`, slug, name: slug.toUpperCase(), createdAt: '2026-01-01',
    users: 0, admins: 0, customers: 0, catalogItems: 0, workOrders, workOrdersInRange: 0,
    openWorkOrders: 0, statusCounts: {}, loginsInRange: 0, activeUsersInRange: 0,
    activeSessions: 0, lastWorkOrderAt: null, lastLoginAt: null, hasLoginLogo: false,
  }
}

describe('buildSeries', () => {
  it('colours organizations by slug, independent of their order or volume', () => {
    const a = buildSeries([tenant('zeta', 1), tenant('alfa', 99)], 'Other').series
    const b = buildSeries([tenant('alfa', 0), tenant('zeta', 500)], 'Other').series
    expect(a).toEqual(b)
    expect(a.map((s) => [s.key, s.color])).toEqual([
      ['alfa', SERIES_COLORS[0]],
      ['zeta', SERIES_COLORS[1]],
    ])
  })

  it('folds organizations past eight into "other" instead of inventing colours', () => {
    const tenants = Array.from({ length: 10 }, (_, i) => tenant(`t${i}`, i))
    const { series, keyFor } = buildSeries(tenants, 'Other')
    expect(series).toHaveLength(8)
    expect(series.at(-1)?.key).toBe(OTHER_KEY)
    // The two quietest fold away.
    expect(keyFor('t0')).toBe(OTHER_KEY)
    expect(keyFor('t9')).toBe('t9')
  })
})

describe('buildRows', () => {
  it('buckets days into weeks and sums folded series', () => {
    const daily = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      workOrders: { a: 1, b: 2 },
      logins: { a: 0, b: 0 },
    }))
    const series = [{ key: 'a', label: 'A', color: '#000' }, { key: OTHER_KEY, label: 'O', color: '#111' }]
    const rows = buildRows(daily, 'workOrders', series, (slug) => (slug === 'a' ? 'a' : OTHER_KEY), 7)
    expect(rows).toEqual([
      { date: '2026-10-01', a: 7, [OTHER_KEY]: 14 },
      { date: '2026-10-08', a: 7, [OTHER_KEY]: 14 },
    ])
  })
})
