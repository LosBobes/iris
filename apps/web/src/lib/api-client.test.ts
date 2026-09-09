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
      .mockResolvedValueOnce(
        response({ items: [{ id: 'cust-1', name: 'Stamparija Demo' }], total: 1 }),
      )
      .mockResolvedValueOnce(response([{ id: 'loc-1', customerId: 'cust-1' }]))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.getCustomers()).resolves.toEqual({
      items: [{ id: 'cust-1', name: 'Stamparija Demo' }],
      total: 1,
    })
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

    await expect(api.getCustomers()).resolves.toEqual({ items: [], total: 0 })
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
        orderNumber: 'RN-2026-00026',
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

  it('coerces null work-order collections to empty arrays (legacy payloads)', async () => {
    // Reproduces the WorkOrderDetailPage crash: a specific order stored with
    // `null` for collection fields must not surface `null` to the component,
    // which reads `.length` on events/internalNotes/customerNotes/lineItems.
    const legacyOrder = {
      id: 'wo-legacy',
      orderNumber: 'RN-2024-00099',
      customerId: null,
      locationId: null,
      clientName: 'Legacy Co',
      contactPerson: null,
      jobDescription: 'legacy order',
      jobDetails: null,
      billingDocumentType: null,
      billingDocumentNumber: null,
      shipping: {},
      issuedBy: 'admin',
      executedBy: null,
      assignment: { assignedTo: null, priority: 'normal' },
      issueDate: '2024-01-01',
      proformaDueDate: null,
      dueDate: null,
      isCompleted: false,
      status: 'new',
      price: null,
      note: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      completionDate: null,
      statusHistory: null,
      internalNotes: null,
      customerNotes: null,
      events: null,
      attachments: null,
      materialUsage: null,
      timeEntries: null,
      invoiceDraft: { status: 'none', invoiceNumber: null, lineItems: null, paidAt: null },
      communication: {
        publicToken: 'tok-legacy',
        notificationEmail: null,
        emailNotificationsEnabled: false,
        signedBy: null,
        signedAt: null,
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(legacyOrder))
      .mockResolvedValueOnce(response({ items: [legacyOrder], total: 1 }))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    const single = await api.getWorkOrderById('wo-legacy')
    expect(single).not.toBeNull()
    expect(single?.events).toEqual([])
    expect(single?.internalNotes).toEqual([])
    expect(single?.customerNotes).toEqual([])
    expect(single?.statusHistory).toEqual([])
    expect(single?.attachments).toEqual([])
    expect(single?.materialUsage).toEqual([])
    expect(single?.timeEntries).toEqual([])
    expect(single?.invoiceDraft.lineItems).toEqual([])

    const list = await api.getWorkOrders()
    expect(list.items[0].events).toEqual([])
    expect(list.items[0].internalNotes).toEqual([])
    expect(list.items[0].invoiceDraft.lineItems).toEqual([])
  })

  it('fetches catalog cost history and unwraps the items array', async () => {
    const records = [
      {
        id: 'cph-1',
        catalogItemId: 'cat-1',
        purchasePrice: 120,
        salePrice: 260,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        createdAt: '2026-07-23T00:00:00Z',
      },
    ]
    const fetchMock = vi.fn(async () => response({ items: records }))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)

    const history = await api.getCatalogItemCostHistory('cat-1')
    expect(history).toEqual(records)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/catalog-items/cat-1/cost-history',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('returns an empty array when cost history is missing', async () => {
    const fetchMock = vi.fn(async () => response({}))
    const api = createHttpApi('http://127.0.0.1:8080', fetchMock)
    await expect(api.getCatalogItemCostHistory('cat-x')).resolves.toEqual([])
  })
})

// The api-client reaches for several Sentry entry points now (exceptions,
// breadcrumbs, identity), so the mock has to stand in for all of them —
// a missing export surfaces as an unrelated assertion failure.
function mockSentry(captureException = vi.fn()) {
  vi.doMock('@sentry/react', () => ({
    captureException,
    addBreadcrumb: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    init: vi.fn(),
  }))
  return captureException
}

describe('failed requests', () => {
  it('carries the API message and request reference, and reports them', async () => {
    const captureException = mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')
    const { ApiError, formatActionError } = await import('./errors')

    const fetchMock = vi.fn(async () =>
      response(
        {
          error: 'Jedinica mere „sat“ nije dozvoljena.',
          requestId: 'AbC123-000042',
        },
        { status: 422, headers: { 'X-Request-Id': 'AbC123-000042' } },
      ),
    )
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    const error = await api.createWorkOrder(baseInput).catch((thrown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.requestId).toBe('AbC123-000042')
    // The operator sees which stavka to fix plus a code support can trace.
    expect(formatActionError('Greška pri kreiranju radnog naloga', error)).toBe(
      'Greška pri kreiranju radnog naloga: Jedinica mere „sat“ nije dozvoljena. (kod: AbC123-000042)',
    )
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ level: 'warning' }),
    )

    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('names the failing call in the Sentry title and fingerprint', async () => {
    const captureException = mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')

    const fetchMock = vi.fn(async () =>
      response({ error: 'Interna greška.' }, { status: 500 }),
    )
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    const error = await api.getWorkOrderById('179').catch((thrown) => thrown)

    // The issue title is the error name, so it has to identify the failure on
    // its own: production bundles are minified and carry no source maps.
    expect(error.name).toBe(
      'ApiError 500 GET /work-orders/:id (getWorkOrderById)',
    )
    expect(error.operation).toBe('getWorkOrderById')
    expect(error.route).toBe('/work-orders/:id')
    // The operator still reads exactly what the server said.
    expect(error.message).toBe('Interna greška.')
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        level: 'error',
        // Grouping by route pattern keeps one broken endpoint as one issue
        // rather than one issue per work order.
        fingerprint: ['api', 'getWorkOrderById', '/work-orders/:id', '500'],
      }),
    )

    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('does not report an expired session', async () => {
    const captureException = mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')

    const fetchMock = vi.fn(async () =>
      response({ error: 'Sesija je istekla.' }, { status: 401 }),
    )
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.getWorkOrders()).rejects.toThrow('Sesija je istekla.')
    expect(captureException).not.toHaveBeenCalled()

    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('announces an expired session so the app can force a re-login', async () => {
    mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')
    const { subscribeSessionExpired } = await import('./session')

    const expired = vi.fn()
    const unsubscribe = subscribeSessionExpired(expired)

    const fetchMock = vi.fn(async () =>
      response({ error: 'Potrebna je prijava.' }, { status: 401 }),
    )
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    await expect(api.getLocations()).rejects.toThrow('Potrebna je prijava.')
    expect(expired).toHaveBeenCalledTimes(1)

    unsubscribe()
    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('does not announce an expired session for a rejected login', async () => {
    mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')
    const { subscribeSessionExpired } = await import('./session')

    const expired = vi.fn()
    const unsubscribe = subscribeSessionExpired(expired)

    const fetchMock = vi.fn(async () =>
      response({ error: 'Neispravna lozinka.' }, { status: 401 }),
    )
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    await expect(
      api.login({ orgSlug: 'demo', username: 'admin', password: 'wrong' }),
    ).rejects.toThrow('Neispravna lozinka.')
    // Bouncing someone off the login form they are already looking at helps
    // nobody.
    expect(expired).not.toHaveBeenCalled()

    unsubscribe()
    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('turns an unreachable server into an error that names the call', async () => {
    const captureException = mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')
    const { ApiNetworkError } = await import('./errors')

    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    const error = await api.getCustomers().catch((thrown) => thrown)
    expect(error).toBeInstanceOf(ApiNetworkError)
    // `TypeError: Failed to fetch` says nothing about what the app was doing.
    expect(error.name).toBe('ApiNetworkError GET /customers (getCustomers)')
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        fingerprint: ['api-network', 'getCustomers', '/customers'],
      }),
    )

    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('reports a repeated network failure once per operation', async () => {
    const captureException = mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')

    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const api = createApi('http://127.0.0.1:8080', fetchMock)

    await api.getCustomers().catch(() => undefined)
    await api.getCustomers().catch(() => undefined)
    await api.getCustomers().catch(() => undefined)

    // An operator whose connection drops fails every request on the page; one
    // event per operation keeps a real outage visible without a flood.
    expect(captureException).toHaveBeenCalledTimes(1)

    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })

  it('keeps the synchronous URL builders synchronous', async () => {
    mockSentry()
    vi.resetModules()
    const { createHttpApi: createApi } = await import('./api-client')
    const api = createApi('http://127.0.0.1:8080', vi.fn())

    expect(api.getWorkOrderReportUrl('179')).toBe(
      'http://127.0.0.1:8080/work-orders/179/report',
    )

    vi.doUnmock('@sentry/react')
    vi.resetModules()
  })
})
