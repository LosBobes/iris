import type {
  WorkOrder,
  WorkOrderStatus,
  DashboardFilters,
  DashboardSummary,
  DeliveryMethod
} from '@/types/work-order'
import { WORK_ORDER_STATUS_ORDER } from '@/shared/utils/work-orders'

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
 * Filters on issueDate. String comparison on YYYY-MM-DD dates is safe for ISO-8601.
 */
export function filterWorkOrders(
  orders: WorkOrder[],
  filters: DashboardFilters
): WorkOrder[] {
  return orders.filter((order) => {
    if (filters.dateFrom !== null && order.issueDate < filters.dateFrom) return false
    if (filters.dateTo !== null && order.issueDate > filters.dateTo) return false
    if (filters.issuedBy !== null && order.issuedBy !== filters.issuedBy) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** Derives counts and revenue from a (possibly filtered) WorkOrder array. */
export function deriveSummary(orders: WorkOrder[]): DashboardSummary {
  const statusCounts = Object.fromEntries(
    WORK_ORDER_STATUS_ORDER.map((status) => [status, 0])
  ) as Record<WorkOrderStatus, number>
  let totalRevenue = 0

  for (const order of orders) {
    statusCounts[order.status]++
    if (order.price !== null) totalRevenue += order.price
  }

  return {
    totalOrders: orders.length,
    statusCounts,
    totalRevenue,
  }
}

// ---------------------------------------------------------------------------
// Monthly buckets
// ---------------------------------------------------------------------------

/**
 * Groups orders by calendar month (based on issueDate) and returns an array
 * sorted chronologically. Revenue bucket excludes orders where price === null.
 */
export function monthlyBuckets(orders: WorkOrder[]): MonthlyBucket[] {
  const map = new Map<string, MonthlyBucket>()

  for (const order of orders) {
    const month = order.issueDate.slice(0, 7) // 'YYYY-MM'
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
    const method = order.shipping?.deliveryMethod
    if (method == null) continue
    map.set(method, (map.get(method) ?? 0) + 1)
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
    .sort((a, b) => b.count - a.count || a.clientName.localeCompare(b.clientName))
    .slice(0, n)
}
