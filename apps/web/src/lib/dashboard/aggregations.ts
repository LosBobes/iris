import type {
  WorkOrder,
  WorkOrderStatus,
  DashboardFilters,
  DashboardSummary,
  DeliveryMethod
} from '@/types/work-order'
import {
  getLocalIsoDate,
  WORK_ORDER_STATUS_ORDER,
} from '@/shared/utils/work-orders'

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

export const CORE_ATTENTION_SIGNALS = [
  'overdue',
  'dueToday',
  'dueThisWeek',
] as const

export const INTERNAL_ATTENTION_SIGNALS = [
  'unassigned',
] as const

export const ATTENTION_SIGNALS = [
  ...CORE_ATTENTION_SIGNALS,
  ...INTERNAL_ATTENTION_SIGNALS,
] as const

export type AttentionSignal = (typeof ATTENTION_SIGNALS)[number]

export type AttentionSignalCounts = Record<AttentionSignal, number>

export interface ClientAttentionRow {
  groupKey: string
  customerId: string | null
  displayName: string
  counts: AttentionSignalCounts
  orders: WorkOrder[]
  severity: number
}

const ATTENTION_SIGNAL_SEVERITY: Record<AttentionSignal, number> = {
  overdue: 600,
  dueToday: 500,
  dueThisWeek: 400,
  unassigned: 100,
}

function emptyAttentionCounts(): AttentionSignalCounts {
  return Object.fromEntries(
    ATTENTION_SIGNALS.map((signal) => [signal, 0]),
  ) as AttentionSignalCounts
}

function dateToLocalTimestamp(date: string): number {
  return new Date(`${date}T00:00:00`).getTime()
}

function getAttentionDueDate(order: WorkOrder): string | null {
  return order.dueDate
}

function totalSignalCount(counts: AttentionSignalCounts): number {
  return ATTENTION_SIGNALS.reduce((total, signal) => total + counts[signal], 0)
}

function compareOrderAttention(
  a: WorkOrder,
  b: WorkOrder,
  today: string,
): number {
  const aSeverity = Math.max(
    0,
    ...getWorkOrderAttentionSignals(a, today).map(
      (signal) => ATTENTION_SIGNAL_SEVERITY[signal],
    ),
  )
  const bSeverity = Math.max(
    0,
    ...getWorkOrderAttentionSignals(b, today).map(
      (signal) => ATTENTION_SIGNAL_SEVERITY[signal],
    ),
  )

  return (
    bSeverity - aSeverity ||
    a.orderNumber.localeCompare(b.orderNumber, 'sr-Latn')
  )
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
// Attention signals
// ---------------------------------------------------------------------------

export function normalizeClientGroupName(clientName: string): string {
  return clientName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('sr-Latn')
}

export function getWorkOrderAttentionSignals(
  order: WorkOrder,
  today = getLocalIsoDate(),
): AttentionSignal[] {
  const signals: AttentionSignal[] = []
  const dueDate = getAttentionDueDate(order)

  if (dueDate !== null) {
    if (dueDate < today && !order.isCompleted) {
      signals.push('overdue')
    }
    if (dueDate === today) {
      signals.push('dueToday')
    }

    const dueTimestamp = dateToLocalTimestamp(dueDate)
    const todayTimestamp = dateToLocalTimestamp(today)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (
      dueTimestamp >= todayTimestamp &&
      dueTimestamp <= todayTimestamp + sevenDaysMs
    ) {
      signals.push('dueThisWeek')
    }
  }

  if (!order.assignment.assignedTo) {
    signals.push('unassigned')
  }

  return signals
}

export function buildSignalCounts(
  orders: WorkOrder[],
  today = getLocalIsoDate(),
): AttentionSignalCounts {
  const counts = emptyAttentionCounts()

  for (const order of orders) {
    for (const signal of getWorkOrderAttentionSignals(order, today)) {
      counts[signal]++
    }
  }

  return counts
}

export function buildClientAttentionRows(
  orders: WorkOrder[],
  selectedSignals: readonly AttentionSignal[] = CORE_ATTENTION_SIGNALS,
  today = getLocalIsoDate(),
): ClientAttentionRow[] {
  const selected = new Set<AttentionSignal>(selectedSignals)
  const rows = new Map<
    string,
    ClientAttentionRow & { latestUpdatedAt: string }
  >()

  for (const order of orders) {
    const matchingSignals = getWorkOrderAttentionSignals(order, today).filter(
      (signal) => selected.has(signal),
    )
    if (matchingSignals.length === 0) continue

    const groupKey = order.customerId ?? normalizeClientGroupName(order.clientName)
    const existing = rows.get(groupKey)
    const row =
      existing ??
      {
        groupKey,
        customerId: order.customerId,
        displayName: order.clientName,
        counts: emptyAttentionCounts(),
        orders: [],
        severity: 0,
        latestUpdatedAt: order.updatedAt,
      }

    if (order.updatedAt >= row.latestUpdatedAt) {
      row.displayName = order.clientName
      row.latestUpdatedAt = order.updatedAt
    }

    for (const signal of matchingSignals) {
      row.counts[signal]++
      row.severity = Math.max(row.severity, ATTENTION_SIGNAL_SEVERITY[signal])
    }
    row.orders.push(order)
    rows.set(groupKey, row)
  }

  return Array.from(rows.values())
    .map((row) => ({
      groupKey: row.groupKey,
      customerId: row.customerId,
      displayName: row.displayName,
      counts: row.counts,
      severity: row.severity + totalSignalCount(row.counts) / 100,
      orders: [...row.orders].sort((a, b) => compareOrderAttention(a, b, today)),
    }))
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        totalSignalCount(b.counts) - totalSignalCount(a.counts) ||
        a.displayName.localeCompare(b.displayName, 'sr-Latn'),
    )
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
