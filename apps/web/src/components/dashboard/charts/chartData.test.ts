import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { monthlyBuckets } from '@/lib/dashboard/aggregations'
import type { WorkOrder } from '@/types/work-order'
import { resolveChartMonths } from './utils'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/work-orders.json',
)
const fixtureOrders = JSON.parse(readFileSync(fixturePath, 'utf8')) as WorkOrder[]

describe('monthly dashboard charts', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps fixture work orders into the visible chart window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))

    const buckets = monthlyBuckets(fixtureOrders)
    const months = buckets.map(({ month }) => month)
    const chartMonths = resolveChartMonths(months)
    const countByMonth = new Map(buckets.map(({ month, count }) => [month, count]))
    const revenueByMonth = new Map(buckets.map(({ month, revenue }) => [month, revenue]))

    const chartCounts = chartMonths.map((month) => countByMonth.get(month) ?? 0)
    const chartRevenue = chartMonths.map((month) => revenueByMonth.get(month) ?? 0)

    expect(chartCounts.some((count) => count > 0)).toBe(true)
    expect(chartRevenue.some((revenue) => revenue > 0)).toBe(true)
    expect(chartRevenue.reduce((sum, revenue) => sum + revenue, 0)).toBeGreaterThan(0)
  })
})
