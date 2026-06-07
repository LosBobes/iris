import { describe, expect, it, vi } from 'vitest'
import { createHttpApi } from './api-client'
import type { CreateWorkOrderInput } from '@/types/work-order'

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const baseInput: CreateWorkOrderInput = {
  customerId: 'cust-1',
  locationId: 'loc-1',
  clientName: 'Stamparija Demo',
  contactPerson: 'Milica',
  jobDescription: 'Katalog',
  jobDetails: null,
  billingDocumentType: 'invoice',
  billingDocumentNumber: null,
  shipping: {
    deliveryMethod: 'pickup',
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
  assignment: {
    assignedTo: 'ana.jovic',
    priority: 'high',
    scheduledDate: '2026-05-26',
  },
  issuedBy: 'admin',
  issueDate: '2026-05-25',
  dueDate: '2026-05-30',
  price: 12000,
  note: null,
  internalNotes: [],
  customerNotes: [],
  attachments: [],
  materialUsage: [],
  timeEntries: [],
  invoiceDraft: {
    status: 'draft',
    invoiceNumber: null,
    lineItems: [],
    paidAt: null,
  },
  communication: {
    publicToken: '',
    notificationEmail: 'demo@example.com',
    emailNotificationsEnabled: true,
    signedBy: null,
    signedAt: null,
  },
}

describe('createHttpApi', () => {
  it('checks backend readiness through /healthz', async () => {
    const fetchMock = vi.fn(async () => response({ status: 'ok' }))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.getBackendStatus()).resolves.toEqual({ ready: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/healthz',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('reports backend unavailable when /healthz returns non-API HTML', async () => {
    const fetchMock = vi.fn(
      async () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    )
    const api = createHttpApi('http://127.0.0.1:5173', fetchMock)

    await expect(api.getBackendStatus()).resolves.toEqual({
      ready: false,
      message: 'Backend servis nije dostupan. Pokrenite iris-api i pokušajte ponovo.',
    })
  })

  it('loads normalized customers and locations from the API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([{ id: 'cust-1', name: 'Stamparija Demo' }]))
      .mockResolvedValueOnce(response([{ id: 'loc-1', customerId: 'cust-1' }]))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.getCustomers()).resolves.toEqual([
      { id: 'cust-1', name: 'Stamparija Demo' },
    ])
    await expect(api.getLocations()).resolves.toEqual([
      { id: 'loc-1', customerId: 'cust-1' },
    ])
  })

  it('normalizes nullable list responses to empty arrays', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response({ items: null, total: 0 }))
      .mockResolvedValueOnce(response(null))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.getCustomers()).resolves.toEqual([])
    await expect(api.getLocations()).resolves.toEqual([])
    await expect(api.getWorkOrders()).resolves.toEqual({ items: [], total: 0 })
    await expect(api.getWorkOrderOperators()).resolves.toEqual([])
  })

  it('passes work-order list filters to the API', async () => {
    const fetchMock = vi.fn(async () => response({ items: [], total: 0 }))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    await expect(
      api.getWorkOrders({ search: 'katalog', limit: 15, offset: 30, sort: '-issueDate' }),
    ).resolves.toEqual({ items: [], total: 0 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/work-orders?search=katalog&limit=15&offset=30&sort=-issueDate',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('posts the expanded work-order input to the API', async () => {
    const fetchMock = vi.fn(async () =>
      response({
        ...baseInput,
        id: '26',
        orderNumber: 'RN-2026-0026',
        status: 'new',
        isCompleted: false,
        executedBy: null,
        createdAt: '2026-05-25T10:00:00Z',
        updatedAt: '2026-05-25T10:00:00Z',
        completionDate: null,
      }, { status: 201 }),
    )
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.createWorkOrder(baseInput)).resolves.toMatchObject({
      id: '26',
      status: 'new',
      assignment: { assignedTo: 'ana.jovic', priority: 'high' },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/work-orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(baseInput),
      }),
    )
  })

  it('creates stable public tracking and report URLs', () => {
    const api = createHttpApi('http://127.0.0.1:8080')

    expect(api.getPublicTrackingUrl('tok-1')).toBe(
      'http://127.0.0.1:8080/public/work-orders/tok-1',
    )
    expect(api.getWorkOrderReportUrl('42')).toBe(
      'http://127.0.0.1:8080/work-orders/42/report',
    )
  })
})
