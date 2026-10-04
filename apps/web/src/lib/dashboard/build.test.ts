import { describe, expect, it } from 'vitest'
import { buildDashboardData } from './build'
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
    assignment: { assignedTo: 'marko', priority: 'normal' },
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

const today = '2026-06-10'
const admin = { username: 'admin', isAdmin: true }
const operator = { username: 'marko', isAdmin: false }

describe('buildDashboardData', () => {
  const orders = [
    order({ id: 'a', orderNumber: 'RN-1', customerId: 'c1', issueDate: '2026-05-01', dueDate: '2026-06-01' }, [
      line({ unitPrice: 200, unitCost: 50 }),
    ]),
    order(
      {
        id: 'b',
        orderNumber: 'RN-2',
        customerId: 'c2',
        clientName: 'Beta',
        issueDate: '2026-06-05',
        dueDate: today,
        status: 'inProgress',
        assignment: { assignedTo: null, priority: 'normal' },
      },
      [line({ id: 'li-2', kind: 'goods', unitPrice: 100, unitCost: 30 })],
    ),
    order({ id: 'c', orderNumber: 'RN-3', status: 'cancelled', dueDate: '2026-06-01' }, []),
  ]

  it('withholds finance from operators but keeps their queue', () => {
    const data = buildDashboardData(orders, { today }, operator)
    expect(data.finance).toBeNull()
    expect(data.operatorQueue).toEqual({
      assignedToMe: 1,
      dueToday: 0,
      overdue: 1,
      inProgress: 0,
      available: 1,
    })
  })

  it('scopes only the item breakdown to the requested company', () => {
    const data = buildDashboardData(orders, { today, companyKey: 'c1' }, admin)
    expect(data.finance?.profitTotals.total).toBe(150 + 70)
    expect(data.finance?.companyProfit).toHaveLength(3)
    expect(data.finance?.itemProfit.services).toHaveLength(1)
    expect(data.finance?.itemProfit.articles).toHaveLength(0)
  })

  it('filters charts but computes attention over every order', () => {
    const data = buildDashboardData(orders, { today, dateFrom: '2026-06-01' }, admin)
    expect(data.hasOrders).toBe(true)
    expect(data.summary.totalOrders).toBe(1)
    // RN-1 is overdue even though the date filter excludes it; cancelled RN-3 is not.
    expect(data.signalCounts).toMatchObject({ overdue: 1, dueToday: 1, unassigned: 1 })
    expect(data.queueSummary).toEqual({ today: 1, overdue: 1, unassigned: 1 })
  })

  it('returns the slim attention-order projection', () => {
    const data = buildDashboardData(orders, { today }, admin)
    const first = data.clientAttentionRows[0]
    expect(Object.keys(first.orders[0]).sort()).toEqual(
      ['dueDate', 'id', 'jobDescription', 'orderNumber', 'status'],
    )
  })

  it('reports no orders for an empty store', () => {
    const data = buildDashboardData([], { today }, admin)
    expect(data.hasOrders).toBe(false)
    expect(data.clientAttentionRows).toEqual([])
  })
})
