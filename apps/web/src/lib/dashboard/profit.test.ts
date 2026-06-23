import { describe, expect, it } from 'vitest'
import {
  monthlyProfit,
  profitByCompany,
  profitByKind,
  topCompaniesByProfit,
  totalRevenue,
} from '@/lib/dashboard/profit'
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

function order(overrides: Partial<WorkOrder>, lineItems: InvoiceLineItem[]): WorkOrder {
  return {
    id: 'order-1',
    orderNumber: 'RN-1',
    customerId: null,
    locationId: null,
    clientName: 'Acme d.o.o.',
    contactPerson: null,
    jobDescription: 'Test nalog',
    jobDetails: null,
    billingDocumentType: null,
    billingDocumentNumber: null,
    shipping: {
      deliveryMethod: null,
      drivesOut: false,
      postagePaymentType: null,
      waitForPayment: false,
      hasPackaging: false,
      hasLabeling: false,
      isFragile: false,
      requiresSignature: false,
      hasInsurance: false,
      shippingAddress: null,
    },
    issuedBy: 'ana',
    executedBy: null,
    assignment: { assignedTo: 'marko', priority: 'normal', scheduledDate: null },
    issueDate: '2026-05-20',
    dueDate: null,
    isCompleted: false,
    status: 'assigned',
    price: null,
    note: null,
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-05-20T08:00:00Z',
    completionDate: null,
    statusHistory: [],
    internalNotes: [],
    customerNotes: [],
    events: [],
    attachments: [],
    materialUsage: [],
    timeEntries: [],
    invoiceDraft: { status: 'draft', invoiceNumber: null, lineItems, paidAt: null },
    communication: {
      publicToken: 'token',
      notificationEmail: null,
      emailNotificationsEnabled: false,
      signedBy: null,
      signedAt: null,
    },
    ...overrides,
  }
}

describe('profitByKind', () => {
  it('splits margin between services and articles', () => {
    const orders = [
      order({}, [
        line({ kind: 'service', unitPrice: 300, unitCost: 120, quantity: 2 }), // 360
        line({ id: 'li-2', kind: 'goods', unitPrice: 620, unitCost: 400, quantity: 1 }), // 220
      ]),
    ]
    expect(profitByKind(orders)).toEqual({ service: 360, article: 220, total: 580 })
    expect(totalRevenue(orders)).toBe(300 * 2 + 620)
  })

  it('treats a missing unitCost (non-admin / ad-hoc) as zero cost', () => {
    const orders = [order({}, [line({ unitPrice: 100, unitCost: undefined, quantity: 1 })])]
    expect(profitByKind(orders).total).toBe(100)
  })
})

describe('monthlyProfit', () => {
  it('buckets profit by issue month and skips orders without line items', () => {
    const orders = [
      order({ id: 'a', issueDate: '2026-04-10' }, [line({ unitPrice: 100, unitCost: 40 })]), // 60
      order({ id: 'b', issueDate: '2026-05-02' }, [
        line({ kind: 'goods', unitPrice: 200, unitCost: 50 }), // 150 article
      ]),
      order({ id: 'c', issueDate: '2026-05-15' }, []), // skipped
    ]
    const months = monthlyProfit(orders)
    expect(months).toHaveLength(2)
    expect(months[0]).toMatchObject({ month: '2026-04', service: 60, total: 60 })
    expect(months[1]).toMatchObject({ month: '2026-05', article: 150, total: 150 })
  })
})

describe('profitByCompany / topCompaniesByProfit', () => {
  it('groups by customerId and ranks by profit descending', () => {
    const orders = [
      order({ id: 'a', customerId: 'c1', clientName: 'Alpha' }, [
        line({ unitPrice: 100, unitCost: 40 }), // 60
      ]),
      order({ id: 'b', customerId: 'c1', clientName: 'Alpha', updatedAt: '2026-06-01T00:00:00Z' }, [
        line({ unitPrice: 200, unitCost: 50 }), // 150
      ]),
      order({ id: 'c', customerId: 'c2', clientName: 'Beta' }, [
        line({ unitPrice: 1000, unitCost: 100 }), // 900
      ]),
    ]
    const ranked = topCompaniesByProfit(orders)
    expect(ranked[0]).toMatchObject({ customerId: 'c2', name: 'Beta', profit: 900, orderCount: 1 })
    expect(ranked[1]).toMatchObject({ customerId: 'c1', name: 'Alpha', profit: 210, orderCount: 2 })
    expect(profitByCompany(orders)).toHaveLength(2)
  })

  it('falls back to a normalized client name when there is no customerId', () => {
    const orders = [
      order({ id: 'a', customerId: null, clientName: 'Gamma  DOO' }, [line({})]),
      order({ id: 'b', customerId: null, clientName: 'gamma doo' }, [line({})]),
    ]
    expect(profitByCompany(orders)).toHaveLength(1)
  })
})
