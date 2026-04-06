import { describe, expect, it } from 'vitest'
import type { WorkOrder, DashboardFilters } from '@/types/work-order'
import {
  deliveryDistribution,
  deriveSummary,
  filterWorkOrders,
  monthlyBuckets,
  topClients
} from './aggregations'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const base = (overrides: Partial<WorkOrder>): WorkOrder => ({
  id: '0',
  clientName: 'Test Company',
  documentType: 'invoice',
  deliveryMethod: 'email',
  issuedBy: 'operator.a',
  createdAt: '2025-01-15',
  completedAt: '2025-01-16',
  price: 10000,
  ...overrides
})

const ORDERS: WorkOrder[] = [
  base({ id: '1', clientName: 'Client A', createdAt: '2024-11-10', completedAt: '2024-11-11', price: 5000, issuedBy: 'operator.a', deliveryMethod: 'email' }),
  base({ id: '2', clientName: 'Client B', createdAt: '2024-11-20', completedAt: null, price: null, issuedBy: 'operator.b', deliveryMethod: 'pickup' }),
  base({ id: '3', clientName: 'Client A', createdAt: '2024-12-05', completedAt: '2024-12-06', price: 8000, issuedBy: 'operator.a', deliveryMethod: 'courier' }),
  base({ id: '4', clientName: 'Client C', createdAt: '2025-01-10', completedAt: null, price: 3000, issuedBy: 'operator.b', deliveryMethod: 'fax' }),
  base({ id: '5', clientName: 'Client A', createdAt: '2025-01-25', completedAt: '2025-01-26', price: null, issuedBy: 'operator.a', deliveryMethod: 'email' }),
  base({ id: '6', clientName: 'Client D', createdAt: '2025-02-14', completedAt: '2025-02-15', price: 12000, issuedBy: 'operator.b', deliveryMethod: 'email' }),
]

const NO_FILTERS: DashboardFilters = { dateFrom: null, dateTo: null, issuedBy: null }

// ---------------------------------------------------------------------------
// filterWorkOrders
// ---------------------------------------------------------------------------

describe('filterWorkOrders', () => {
  it('returns all orders when no filters are set', () => {
    expect(filterWorkOrders(ORDERS, NO_FILTERS)).toHaveLength(ORDERS.length)
  })

  it('filters by dateFrom (inclusive)', () => {
    const result = filterWorkOrders(ORDERS, { ...NO_FILTERS, dateFrom: '2025-01-01' })
    expect(result).toHaveLength(3)
    result.forEach((o) => expect(o.createdAt >= '2025-01-01').toBe(true))
  })

  it('filters by dateTo (inclusive)', () => {
    const result = filterWorkOrders(ORDERS, { ...NO_FILTERS, dateTo: '2024-12-31' })
    expect(result).toHaveLength(3)
    result.forEach((o) => expect(o.createdAt <= '2024-12-31').toBe(true))
  })

  it('filters by date range (both bounds)', () => {
    const result = filterWorkOrders(ORDERS, {
      dateFrom: '2024-12-01',
      dateTo: '2025-01-31',
      issuedBy: null
    })
    expect(result).toHaveLength(3) // ids 3, 4, 5
    expect(result.map((o) => o.id)).toEqual(expect.arrayContaining(['3', '4', '5']))
  })

  it('filters by issuedBy', () => {
    const result = filterWorkOrders(ORDERS, { ...NO_FILTERS, issuedBy: 'operator.a' })
    expect(result).toHaveLength(3) // ids 1, 3, 5
    result.forEach((o) => expect(o.issuedBy).toBe('operator.a'))
  })

  it('combines date range and issuedBy filters', () => {
    const result = filterWorkOrders(ORDERS, {
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
      issuedBy: 'operator.a'
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('5')
  })

  it('returns empty array when nothing matches', () => {
    const result = filterWorkOrders(ORDERS, { ...NO_FILTERS, issuedBy: 'unknown' })
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// deriveSummary
// ---------------------------------------------------------------------------

describe('deriveSummary', () => {
  it('counts total, completed, and in-progress orders', () => {
    const summary = deriveSummary(ORDERS)
    expect(summary.totalOrders).toBe(6)
    expect(summary.completedOrders).toBe(4) // ids 1, 3, 5(?), 6 — wait, 5 is completed too
    // Let me recount: 1(comp), 2(null), 3(comp), 4(null), 5(comp), 6(comp) => 4 completed
    expect(summary.inProgressOrders).toBe(2) // ids 2, 4
  })

  it('sums revenue excluding null prices', () => {
    // prices: 5000, null, 8000, 3000, null, 12000 => 28000
    const summary = deriveSummary(ORDERS)
    expect(summary.totalRevenue).toBe(28000)
  })

  it('excludes price === null orders from revenue totals', () => {
    const ordersWithNullPrices: WorkOrder[] = [
      base({ id: 'a', price: 1000 }),
      base({ id: 'b', price: null }),
      base({ id: 'c', price: null }),
      base({ id: 'd', price: 500 })
    ]
    const summary = deriveSummary(ordersWithNullPrices)
    expect(summary.totalRevenue).toBe(1500)
  })

  it('returns zero revenue for an empty array', () => {
    const summary = deriveSummary([])
    expect(summary.totalRevenue).toBe(0)
    expect(summary.totalOrders).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// monthlyBuckets
// ---------------------------------------------------------------------------

describe('monthlyBuckets', () => {
  it('groups orders into correct months', () => {
    const buckets = monthlyBuckets(ORDERS)
    const months = buckets.map((b) => b.month)
    expect(months).toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
  })

  it('returns buckets sorted chronologically', () => {
    const buckets = monthlyBuckets(ORDERS)
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].month > buckets[i - 1].month).toBe(true)
    }
  })

  it('counts orders per month correctly', () => {
    const buckets = monthlyBuckets(ORDERS)
    const nov = buckets.find((b) => b.month === '2024-11')!
    expect(nov.count).toBe(2)
  })

  it('sums revenue per month excluding null prices', () => {
    const buckets = monthlyBuckets(ORDERS)
    // Nov: 5000 + null = 5000
    const nov = buckets.find((b) => b.month === '2024-11')!
    expect(nov.revenue).toBe(5000)

    // Jan: 3000 + null = 3000
    const jan = buckets.find((b) => b.month === '2025-01')!
    expect(jan.revenue).toBe(3000)
  })

  it('returns empty array for empty input', () => {
    expect(monthlyBuckets([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// deliveryDistribution
// ---------------------------------------------------------------------------

describe('deliveryDistribution', () => {
  it('counts each delivery method', () => {
    const dist = deliveryDistribution(ORDERS)
    const emailCount = dist.find((d) => d.method === 'email')?.count
    expect(emailCount).toBe(3) // ids 1, 5, 6
  })

  it('returns results sorted by count descending', () => {
    const dist = deliveryDistribution(ORDERS)
    for (let i = 1; i < dist.length; i++) {
      expect(dist[i].count <= dist[i - 1].count).toBe(true)
    }
  })

  it('only includes methods present in the data', () => {
    const orders = [base({ deliveryMethod: 'email' }), base({ deliveryMethod: 'email' })]
    const dist = deliveryDistribution(orders)
    expect(dist).toHaveLength(1)
    expect(dist[0]).toEqual({ method: 'email', count: 2 })
  })

  it('returns empty array for empty input', () => {
    expect(deliveryDistribution([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// topClients
// ---------------------------------------------------------------------------

describe('topClients', () => {
  it('returns clients sorted by order count descending', () => {
    const result = topClients(ORDERS)
    // Client A has 3 orders, B/C/D have 1 each
    expect(result[0]).toEqual({ clientName: 'Client A', count: 3 })
  })

  it('respects the n limit', () => {
    const manyOrders = Array.from({ length: 15 }, (_, i) =>
      base({ id: String(i), clientName: `Client ${i}` })
    )
    const result = topClients(manyOrders, 10)
    expect(result).toHaveLength(10)
  })

  it('returns all clients when fewer than n', () => {
    const result = topClients(ORDERS, 10)
    // 4 unique clients in ORDERS
    expect(result).toHaveLength(4)
  })

  it('returns empty array for empty input', () => {
    expect(topClients([])).toEqual([])
  })
})
