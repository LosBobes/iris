import type {
  WorkOrder,
  DashboardFilters,
  DashboardSummary,
  DeliveryMethod
} from '@/types/work-order'

// ---------------------------------------------------------------------------
// Public data shapes returned by aggregation functions
// ---------------------------------------------------------------------------

export interface MonthlyBucket {
  /** 'YYYY-MM' */
  month: string
  count: number
  /** Sum of price for orders with price !== null */
  revenue: number
}

export interface DeliveryCount {
  method: DeliveryMethod
  count: number
}

export interface ClientCount {
  clientName: string
  count: number
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Applies DashboardFilters to a WorkOrder array.
 * String comparison on YYYY-MM-DD dates is safe for ISO-8601.
 */
export function filterWorkOrders(
  orders: WorkOrder[],
  filters: DashboardFilters
): WorkOrder[] {
  return orders.filter((order) => {
    if (filters.dateFrom !== null && order.createdAt < filters.dateFrom) return false
    if (filters.dateTo !== null && order.createdAt > filters.dateTo) return false
    if (filters.issuedBy !== null && order.issuedBy !== filters.issuedBy) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** Derives counts and revenue from a (possibly filtered) WorkOrder array. */
export function deriveSummary(orders: WorkOrder[]): DashboardSummary {
  let completedOrders = 0
  let totalRevenue = 0

  for (const order of orders) {
    if (order.completedAt !== null) completedOrders++
    if (order.price !== null) totalRevenue += order.price
  }

  return {
    totalOrders: orders.length,
    completedOrders,
    inProgressOrders: orders.length - completedOrders,
    totalRevenue
  }
}

// ---------------------------------------------------------------------------
// Monthly buckets
// ---------------------------------------------------------------------------

/**
 * Groups orders by calendar month and returns an array sorted chronologically.
 * Revenue bucket excludes orders where price === null.
 */
export function monthlyBuckets(orders: WorkOrder[]): MonthlyBucket[] {
  const map = new Map<string, MonthlyBucket>()

  for (const order of orders) {
    const month = order.createdAt.slice(0, 7) // 'YYYY-MM'
    const bucket = map.get(month) ?? { month, count: 0, revenue: 0 }
    bucket.count++
    if (order.price !== null) bucket.revenue += order.price
    map.set(month, bucket)
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

// ---------------------------------------------------------------------------
// Delivery method distribution
// ---------------------------------------------------------------------------

/** Returns per-method counts, sorted by count descending. */
export function deliveryDistribution(orders: WorkOrder[]): DeliveryCount[] {
  const map = new Map<DeliveryMethod, number>()

  for (const order of orders) {
    map.set(order.deliveryMethod, (map.get(order.deliveryMethod) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// Top clients
// ---------------------------------------------------------------------------

/** Returns the top-N clients by work-order count, sorted descending. */
export function topClients(orders: WorkOrder[], n = 10): ClientCount[] {
  const map = new Map<string, number>()

  for (const order of orders) {
    map.set(order.clientName, (map.get(order.clientName) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([clientName, count]) => ({ clientName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}
