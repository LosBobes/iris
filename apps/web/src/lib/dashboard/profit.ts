import type { InvoiceLineItem, WorkOrder } from '@/types/work-order'
import { normalizeClientGroupName } from '@/lib/dashboard/aggregations'

// ---------------------------------------------------------------------------
// Profit aggregations
//
// Profit is the margin between the sale price (prodajna cena) and the captured
// cost (nabavna cena / cena rada): per line, (unitPrice - unitCost) * quantity.
// Cost is captured on each line at order time and is admin-only, so these
// functions only produce meaningful numbers for admin sessions (the API returns
// unitCost 0 to non-admins). Services and goods/articles are reported separately
// so the dashboard can break profit down by kind.
// ---------------------------------------------------------------------------

export interface ProfitTotals {
  /** Margin from service lines (invoice kind 'service'). */
  service: number
  /** Margin from article lines (invoice kind 'goods'). */
  article: number
  /** service + article. */
  total: number
}

export interface MonthlyProfit extends ProfitTotals {
  /** 'YYYY-MM' */
  month: string
}

export interface CompanyProfit {
  groupKey: string
  customerId: string | null
  name: string
  profit: number
  revenue: number
  orderCount: number
}

/** Per-unit margin of a line: (unitPrice - unitCost) * quantity. */
export function lineMargin(line: InvoiceLineItem): number {
  return (line.unitPrice - (line.unitCost ?? 0)) * line.quantity
}

/** Sale revenue of a line: unitPrice * quantity. */
export function lineRevenue(line: InvoiceLineItem): number {
  return line.unitPrice * line.quantity
}

function emptyTotals(): ProfitTotals {
  return { service: 0, article: 0, total: 0 }
}

function addLineToTotals(totals: ProfitTotals, line: InvoiceLineItem): void {
  const margin = lineMargin(line)
  if (line.kind === 'goods') {
    totals.article += margin
  } else {
    totals.service += margin
  }
  totals.total += margin
}

/** Profit split by kind across the given orders. */
export function profitByKind(orders: WorkOrder[]): ProfitTotals {
  const totals = emptyTotals()
  for (const order of orders) {
    for (const line of order.invoiceDraft.lineItems) {
      addLineToTotals(totals, line)
    }
  }
  return totals
}

/** Total sale revenue across the given orders' line items. */
export function totalRevenue(orders: WorkOrder[]): number {
  let revenue = 0
  for (const order of orders) {
    for (const line of order.invoiceDraft.lineItems) {
      revenue += lineRevenue(line)
    }
  }
  return revenue
}

/**
 * Profit split by kind per calendar month (issueDate), sorted chronologically.
 * Months with no line items are omitted.
 */
export function monthlyProfit(orders: WorkOrder[]): MonthlyProfit[] {
  const map = new Map<string, MonthlyProfit>()
  for (const order of orders) {
    if (order.invoiceDraft.lineItems.length === 0) continue
    const month = order.issueDate.slice(0, 7)
    const bucket = map.get(month) ?? { month, ...emptyTotals() }
    for (const line of order.invoiceDraft.lineItems) {
      addLineToTotals(bucket, line)
    }
    map.set(month, bucket)
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Profit per company (grouped by customerId, falling back to a normalized
 * client name), sorted by profit descending. The display name is taken from the
 * most recently updated order in the group.
 */
export function profitByCompany(orders: WorkOrder[]): CompanyProfit[] {
  const rows = new Map<string, CompanyProfit & { latestUpdatedAt: string }>()
  for (const order of orders) {
    const groupKey = order.customerId ?? normalizeClientGroupName(order.clientName)
    const row =
      rows.get(groupKey) ??
      {
        groupKey,
        customerId: order.customerId,
        name: order.clientName,
        profit: 0,
        revenue: 0,
        orderCount: 0,
        latestUpdatedAt: order.updatedAt,
      }

    if (order.updatedAt >= row.latestUpdatedAt) {
      row.name = order.clientName
      row.latestUpdatedAt = order.updatedAt
    }
    for (const line of order.invoiceDraft.lineItems) {
      row.profit += lineMargin(line)
      row.revenue += lineRevenue(line)
    }
    row.orderCount++
    rows.set(groupKey, row)
  }

  return Array.from(rows.values())
    .map((row) => ({
      groupKey: row.groupKey,
      customerId: row.customerId,
      name: row.name,
      profit: row.profit,
      revenue: row.revenue,
      orderCount: row.orderCount,
    }))
    .sort(
      (a, b) => b.profit - a.profit || a.name.localeCompare(b.name, 'sr-Latn'),
    )
}

/** Returns the top-N companies by profit. */
export function topCompaniesByProfit(
  orders: WorkOrder[],
  n = 10,
): CompanyProfit[] {
  return profitByCompany(orders).slice(0, n)
}
