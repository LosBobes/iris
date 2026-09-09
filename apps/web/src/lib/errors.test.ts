import { describe, expect, it, vi, beforeEach } from 'vitest'
import { normalizeRoute } from './errors'

describe('normalizeRoute', () => {
  it('collapses record identifiers so one endpoint is one issue', () => {
    // Every work order produced its own Sentry issue before this: a single
    // broken endpoint arrived as hundreds of one-event issues.
    expect(normalizeRoute('https://iris-application.com/work-orders/179')).toBe(
      '/work-orders/:id',
    )
    expect(normalizeRoute('/work-orders/179/report')).toBe(
      '/work-orders/:id/report',
    )
    expect(normalizeRoute('/customers/cust-1')).toBe('/customers/:id')
    expect(normalizeRoute('/work-orders/RN-2026-0001')).toBe('/work-orders/:id')
    expect(
      normalizeRoute('/users/3f8a1c2e-4b5d-6789-a0b1-c2d3e4f5a6b7'),
    ).toBe('/users/:id')
  })

  it('keeps fixed sub-resources out of the identifier bucket', () => {
    // These are real distinct endpoints; folding them into `/work-orders/:id`
    // would merge unrelated failures into one issue.
    expect(normalizeRoute('/work-orders/operators')).toBe(
      '/work-orders/operators',
    )
    expect(normalizeRoute('/work-orders/preview')).toBe('/work-orders/preview')
    expect(normalizeRoute('/work-orders/reserve-number')).toBe(
      '/work-orders/reserve-number',
    )
    expect(normalizeRoute('/catalog-items/cleanup')).toBe(
      '/catalog-items/cleanup',
    )
    expect(normalizeRoute('/auth/session')).toBe('/auth/session')
  })

  it('drops the query string, which carries filter values', () => {
    expect(normalizeRoute('/work-orders?status=new&assignedTo=ana')).toBe(
      '/work-orders',
    )
    expect(normalizeRoute('/locations?customerId=cust-1')).toBe('/locations')
  })

  it('treats a long opaque token as an identifier', () => {
    expect(
      normalizeRoute('/public/work-orders/kzmfqpwbrtvxhjdlncsg'),
    ).toBe('/public/work-orders/:id')
  })
})

describe('reportUnexpectedError', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('reports a plain failure under the name of the code that failed', async () => {
    const captureException = vi.fn()
    vi.doMock('@sentry/react', () => ({
      captureException,
      addBreadcrumb: vi.fn(),
      setUser: vi.fn(),
      setTag: vi.fn(),
      init: vi.fn(),
    }))
    const { reportUnexpectedError } = await import('./errors')

    const boom = new TypeError('next is not iterable')
    reportUnexpectedError('WorkOrderDetailPage.loadLocations', boom)

    expect(captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        fingerprint: ['app', 'WorkOrderDetailPage.loadLocations'],
      }),
    )

    vi.doUnmock('@sentry/react')
  })

  it('leaves API failures to the api-client, which already reported them', async () => {
    const captureException = vi.fn()
    vi.doMock('@sentry/react', () => ({
      captureException,
      addBreadcrumb: vi.fn(),
      setUser: vi.fn(),
      setTag: vi.fn(),
      init: vi.fn(),
    }))
    const { ApiError, reportUnexpectedError } = await import('./errors')

    reportUnexpectedError(
      'WorkOrderDetailPage.load',
      new ApiError('Potrebna je prijava.', {
        status: 401,
        url: 'https://iris-application.com/work-orders/179',
      }),
    )

    // Otherwise a single failed request lands in Sentry twice, once with the
    // status and once without.
    expect(captureException).not.toHaveBeenCalled()

    vi.doUnmock('@sentry/react')
  })
})
