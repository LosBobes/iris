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

const ship = (method: WorkOrder['shipping']['deliveryMethod']): WorkOrder['shipping'] => ({
  deliveryMethod: method,
  hasPackaging: false,
  hasLabeling: false,
  isFragile: false,
  requiresSignature: false,
  hasInsurance: false,
  shippingAddress: null,
})

const base = (overrides: Partial<WorkOrder>): WorkOrder => ({
  id: '0',
  orderNumber: 'RN-2025-0000',
  clientName: 'Test Company',
  contactPerson: null,
  jobDescription: 'Test job',
  jobDetails: null,
  billingDocumentType: 'invoice',
  billingDocumentNumber: null,
  shipping: ship('pickup'),
  issuedBy: 'operator.a',
  executedBy: null,
  issueDate: '2025-01-15',
  dueDate: null,
  isCompleted: true,
  status: 'completed',
  price: 10000,
  note: null,
  createdAt: '2025-01-15T08:00:00Z',
  updatedAt: '2025-01-15T08:00:00Z',
  completionDate: null,
  ...overrides
})

const ORDERS: WorkOrder[] = [
  base({ id: '1', clientName: 'Client A', issueDate: '2024-11-10', isCompleted: true,  status: 'completed', price: 5000,  issuedBy: 'operator.a', shipping: ship('pickup') }),
  base({ id: '2', clientName: 'Client B', issueDate: '2024-11-20', isCompleted: false, status: 'active',    price: null,  issuedBy: 'operator.b', shipping: ship('postExpress') }),
  base({ id: '3', clientName: 'Client A', issueDate: '2024-12-05', isCompleted: true,  status: 'completed', price: 8000,  issuedBy: 'operator.a', shipping: ship('cityExpress') }),
  base({ id: '4', clientName: 'Client C', issueDate: '2025-01-10', isCompleted: false, status: 'active',    price: 3000,  issuedBy: 'operator.b', shipping: ship('fieldVisit') }),
  base({ id: '5', clientName: 'Client A', issueDate: '2025-01-25', isCompleted: true,  status: 'completed', price: null,  issuedBy: 'operator.a', shipping: ship('pickup') }),
  base({ id: '6', clientName: 'Client D', issueDate: '2025-02-14', isCompleted: true,  status: 'completed', price: 12000, issuedBy: 'operator.b', shipping: ship('pickup') }),
  base({ id: '7', clientName: 'Client E', issueDate: '2025-02-20', isCompleted: false, status: 'draft',     price: null,  issuedBy: 'operator.a', shipping: ship('postExpress') }),
  base({ id: '8', clientName: 'Client F', issueDate: '2025-02-22', isCompleted: false, status: 'cancelled', price: 2000,  issuedBy: 'operator.b', shipping: ship('pickup') }),
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
    expect(result).toHaveLength(5)
    result.forEach((o) => expect(o.issueDate >= '2025-01-01').toBe(true))
  })

  it('filters by dateTo (inclusive)', () => {
    const result = filterWorkOrders(ORDERS, { ...NO_FILTERS, dateTo: '2024-12-31' })
    expect(result).toHaveLength(3)
    result.forEach((o) => expect(o.issueDate <= '2024-12-31').toBe(true))
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
    expect(result).toHaveLength(4) // ids 1, 3, 5, 7
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
  it('counts orders by status', () => {
    const summary = deriveSummary(ORDERS)
    expect(summary.totalOrders).toBe(8)
    expect(summary.statusCounts.completed).toBe(4)
    expect(summary.statusCounts.active).toBe(2)
    expect(summary.statusCounts.draft).toBe(1)
    expect(summary.statusCounts.cancelled).toBe(1)
  })

  it('does not count draft or cancelled orders as completed', () => {
    const orders = [
      base({ id: 'a', status: 'draft',     isCompleted: false, price: null }),
      base({ id: 'b', status: 'cancelled', isCompleted: false, price: null }),
    ]
    const summary = deriveSummary(orders)
    expect(summary.statusCounts.completed).toBe(0)
    expect(summary.statusCounts.active).toBe(0)
    expect(summary.statusCounts.draft).toBe(1)
    expect(summary.statusCounts.cancelled).toBe(1)
  })

  it('sums revenue excluding null prices', () => {
    // prices: 5000, null, 8000, 3000, null, 12000, null, 2000 => 30000
    const summary = deriveSummary(ORDERS)
    expect(summary.totalRevenue).toBe(30000)
  })

  it('includes cancelled order price in revenue', () => {
    const orders = [
      base({ id: 'a', status: 'cancelled', price: 5000 }),
      base({ id: 'b', status: 'completed', price: 3000 }),
    ]
    expect(deriveSummary(orders).totalRevenue).toBe(8000)
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

  it('returns zero counts for an empty array', () => {
    const summary = deriveSummary([])
    expect(summary.totalRevenue).toBe(0)
    expect(summary.totalOrders).toBe(0)
    expect(summary.statusCounts).toEqual({ draft: 0, active: 0, completed: 0, cancelled: 0 })
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
    const feb = buckets.find((b) => b.month === '2025-02')!
    expect(feb.count).toBe(3) // ids 6, 7, 8
  })

  it('sums revenue per month excluding null prices', () => {
    const buckets = monthlyBuckets(ORDERS)
    // Nov: 5000 + null = 5000
    const nov = buckets.find((b) => b.month === '2024-11')!
    expect(nov.revenue).toBe(5000)

    // Jan: 3000 + null = 3000
    const jan = buckets.find((b) => b.month === '2025-01')!
    expect(jan.revenue).toBe(3000)

    // Feb: 12000 + null + 2000 = 14000
    const feb = buckets.find((b) => b.month === '2025-02')!
    expect(feb.revenue).toBe(14000)
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
    const pickupCount = dist.find((d) => d.method === 'pickup')?.count
    expect(pickupCount).toBe(4) // ids 1, 5, 6, 8
  })

  it('returns results sorted by count descending', () => {
    const dist = deliveryDistribution(ORDERS)
    for (let i = 1; i < dist.length; i++) {
      expect(dist[i].count <= dist[i - 1].count).toBe(true)
    }
  })

  it('only includes methods present in the data', () => {
    const orders = [base({ shipping: ship('pickup') }), base({ shipping: ship('pickup') })]
    const dist = deliveryDistribution(orders)
    expect(dist).toHaveLength(1)
    expect(dist[0]).toEqual({ method: 'pickup', count: 2 })
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
    // Client A has 3 orders, others have 1 each
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
    // 6 unique clients in ORDERS
    expect(result).toHaveLength(6)
  })

  it('returns empty array for empty input', () => {
    expect(topClients([])).toEqual([])
  })
})
