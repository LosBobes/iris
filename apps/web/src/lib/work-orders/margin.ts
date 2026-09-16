import type { InvoiceLineItem, WorkOrder } from '@/types/work-order'

// ---------------------------------------------------------------------------
// Per-order margin (razlika u ceni)
//
// The selling price is visible to every role; the captured cost (nabavna cena /
// cena rada) and the margin derived from it are admin-only — the API returns
// `unitCost`/`profit` as null for non-admin sessions, so these helpers only
// produce numbers for an admin.
//
// The math deliberately mirrors the server's `applyLineItemCosts`: lines whose
// cost has not been captured yet (ad-hoc lines awaiting admin review) are left
// out of the totals instead of being counted as zero-cost, which would inflate
// the margin into the full sale price. Such lines are reported through
// `uncostedLineCount` so the UI can mark the figure provisional.
// ---------------------------------------------------------------------------

export interface LineMargin {
  line: InvoiceLineItem
  /** unitPrice * quantity */
  revenue: number
  /** unitCost * quantity, or null when the line has no captured cost */
  cost: number | null
  /** revenue - cost, or null when the line has no captured cost */
  margin: number | null
}

export interface WorkOrderMargin {
  lines: LineMargin[]
  /** Sale revenue across all line items, costed or not. */
  revenue: number
  /** Sale revenue of the costed lines only — the basis `profit` is measured against. */
  costedRevenue: number
  /** Captured cost of the costed lines. */
  cost: number
  /** costedRevenue - cost. Matches the server-cached `order.profit`. */
  profit: number
  /** profit / costedRevenue, or null when there is no costed revenue to divide by. */
  marginRatio: number | null
  /** Number of line items with no captured cost. */
  uncostedLineCount: number
  /** True when at least one line carries a captured cost. */
  hasCostedLines: boolean
}

/** Margin breakdown of a single line; cost-less lines yield nulls, not zeros. */
export function lineMargin(line: InvoiceLineItem): LineMargin {
  const revenue = line.unitPrice * line.quantity
  const unitCost = line.unitCost ?? null
  if (unitCost === null) {
    return { line, revenue, cost: null, margin: null }
  }
  const cost = unitCost * line.quantity
  return { line, revenue, cost, margin: revenue - cost }
}

/** Per-line and total margin of a work order's invoice draft. */
export function workOrderMargin(order: WorkOrder): WorkOrderMargin {
  const lines = order.invoiceDraft.lineItems.map(lineMargin)

  let revenue = 0
  let costedRevenue = 0
  let cost = 0
  let uncostedLineCount = 0

  for (const entry of lines) {
    revenue += entry.revenue
    if (entry.cost === null) {
      uncostedLineCount++
      continue
    }
    costedRevenue += entry.revenue
    cost += entry.cost
  }

  const profit = costedRevenue - cost
  return {
    lines,
    revenue,
    costedRevenue,
    cost,
    profit,
    marginRatio: costedRevenue > 0 ? profit / costedRevenue : null,
    uncostedLineCount,
    hasCostedLines: lines.length > uncostedLineCount,
  }
}
