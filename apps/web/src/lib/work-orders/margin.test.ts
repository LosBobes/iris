import { describe, expect, it } from 'vitest'
import { lineMargin, workOrderMargin } from '@/lib/work-orders/margin'
import type { InvoiceLineItem, WorkOrder } from '@/types/work-order'

function line(overrides: Partial<InvoiceLineItem>): InvoiceLineItem {
  return {
    id: 'li-1',
    kind: 'service',
    description: 'Štampa',
    quantity: 1,
    unit: 'kom',
    unitPrice: 100,
    unitCost: 40,
    catalogItemId: null,
    ...overrides,
  }
}

function order(lineItems: InvoiceLineItem[]): WorkOrder {
  return {
    invoiceDraft: { status: 'draft', invoiceNumber: null, lineItems, paidAt: null },
  } as unknown as WorkOrder
}

describe('lineMargin', () => {
  it('multiplies the per-unit difference by the quantity', () => {
    expect(lineMargin(line({ unitPrice: 300, unitCost: 120, quantity: 2 }))).toEqual({
      line: expect.objectContaining({ id: 'li-1' }),
      revenue: 600,
      cost: 240,
      margin: 360,
    })
  })

  it('reports a missing cost as null rather than zero', () => {
    const entry = lineMargin(line({ unitPrice: 100, unitCost: null, quantity: 3 }))
    expect(entry.revenue).toBe(300)
    expect(entry.cost).toBeNull()
    expect(entry.margin).toBeNull()
  })

  it('treats an absent unitCost (non-admin response) the same as null', () => {
    expect(lineMargin(line({ unitCost: undefined })).margin).toBeNull()
  })

  it('keeps a genuine zero cost distinct from an uncaptured one', () => {
    expect(lineMargin(line({ unitPrice: 100, unitCost: 0 }))).toMatchObject({
      cost: 0,
      margin: 100,
    })
  })
})

describe('workOrderMargin', () => {
  it('totals revenue, cost and profit across costed lines', () => {
    const result = workOrderMargin(
      order([
        line({ kind: 'service', unitPrice: 300, unitCost: 120, quantity: 2 }), // 360
        line({ id: 'li-2', kind: 'goods', unitPrice: 620, unitCost: 400, quantity: 1 }), // 220
      ]),
    )
    expect(result.revenue).toBe(1220)
    expect(result.costedRevenue).toBe(1220)
    expect(result.cost).toBe(640)
    expect(result.profit).toBe(580)
    expect(result.marginRatio).toBeCloseTo(580 / 1220)
    expect(result.uncostedLineCount).toBe(0)
    expect(result.hasCostedLines).toBe(true)
  })

  it('excludes uncosted lines from the totals but still counts their revenue', () => {
    const result = workOrderMargin(
      order([
        line({ unitPrice: 300, unitCost: 120, quantity: 2 }), // costed: 600 / 240
        line({ id: 'li-2', unitPrice: 500, unitCost: null, quantity: 1 }),
      ]),
    )
    expect(result.revenue).toBe(1100)
    expect(result.costedRevenue).toBe(600)
    expect(result.cost).toBe(240)
    // The uncosted line must not be booked as pure profit.
    expect(result.profit).toBe(360)
    expect(result.marginRatio).toBeCloseTo(0.6)
    expect(result.uncostedLineCount).toBe(1)
    expect(result.hasCostedLines).toBe(true)
  })

  it('matches the server-cached profit for a fully costed order', () => {
    const lineItems = [
      line({ unitPrice: 300, unitCost: 120, quantity: 2 }),
      line({ id: 'li-2', kind: 'goods', unitPrice: 620, unitCost: 400, quantity: 1 }),
    ]
    const cached = lineItems.reduce(
      (sum, item) => sum + (item.unitPrice - (item.unitCost ?? 0)) * item.quantity,
      0,
    )
    expect(workOrderMargin(order(lineItems)).profit).toBe(cached)
  })

  it('reports nothing costed when every line lacks a cost', () => {
    const result = workOrderMargin(order([line({ unitCost: null })]))
    expect(result.hasCostedLines).toBe(false)
    expect(result.marginRatio).toBeNull()
    expect(result.profit).toBe(0)
  })

  it('handles an order with no line items', () => {
    const result = workOrderMargin(order([]))
    expect(result).toMatchObject({
      revenue: 0,
      cost: 0,
      profit: 0,
      marginRatio: null,
      uncostedLineCount: 0,
      hasCostedLines: false,
    })
  })
})
