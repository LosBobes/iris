// @vitest-environment node

import type { CreateWorkOrderInput } from '../../../model/work-order'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIrisApiClient,
  getConfiguredBackendStatus,
} from './iris-api-client'
import { __resetEnvFileCacheForTests } from './runtime-config'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const sampleCreateInput: CreateWorkOrderInput = {
  clientName: 'Demo Klijent',
  contactPerson: null,
  jobDescription: 'Štampa prospekta',
  jobDetails: null,
  billingDocumentType: null,
  billingDocumentNumber: null,
  shipping: {
    deliveryMethod: null,
    hasPackaging: false,
    hasLabeling: false,
    isFragile: false,
    requiresSignature: false,
    hasInsurance: false,
    shippingAddress: null,
  },
  issuedBy: 'admin',
  issueDate: '2026-04-25',
  proformaDueDate: null,
  dueDate: null,
  price: null,
  note: null,
}

describe('iris-api-client', () => {
  const originalApiBaseUrl = process.env.IRIS_API_BASE_URL

  afterEach(() => {
    if (originalApiBaseUrl === undefined) {
      delete process.env.IRIS_API_BASE_URL
    } else {
      process.env.IRIS_API_BASE_URL = originalApiBaseUrl
    }
    vi.restoreAllMocks()
    __resetEnvFileCacheForTests()
  })

  it('returns a configuration error when IRIS_API_BASE_URL is missing', async () => {
    delete process.env.IRIS_API_BASE_URL
    // Point cwd at a directory with no .env so the file fallback in
    // runtime-config also produces no value - we want to exercise the
    // truly-unset branch, not paper over it with an empty string.
    vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent-iris-test-dir')
    __resetEnvFileCacheForTests()

    await expect(getConfiguredBackendStatus()).resolves.toEqual({
      ready: false,
      message:
        'Backend servis nije podešen. Proverite konfiguraciju aplikacije (IRIS_API_BASE_URL).',
    })
  })

  it('reports a ready backend when the health check succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const client = createIrisApiClient({
      baseUrl: 'http://localhost:8080/',
      fetchFn,
    })

    await expect(client.getBackendStatus()).resolves.toEqual({ ready: true })
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8080/healthz',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('returns the backend login response', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        user: { id: '1', username: 'admin', role: 'admin' },
      }),
    )
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(
      client.login({ orgSlug: 'demo', username: 'admin', password: 'admin123' }),
    ).resolves.toEqual({
      success: true,
      user: { id: '1', username: 'admin', role: 'admin' },
    })
  })

  it('returns null for a missing work order detail response', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: 'Radni nalog nije pronađen.' }, { status: 404 }),
    )
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(client.getWorkOrderById('missing')).resolves.toBeNull()
  })

  it('throws a stable Serbian message for validation failures', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: 'Podaci nisu ispravni.' }, { status: 422 }),
    )
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(client.createWorkOrder(sampleCreateInput)).rejects.toThrow(
      'Podaci nisu ispravni.',
    )
  })

  it('builds the catalog query string from kind, search, active and pagination', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }))
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(
      client.getCatalogItems({ kind: 'service', q: 'štampa', active: true, limit: 20, offset: 40 }),
    ).resolves.toEqual({ items: [], total: 0 })

    const requestedUrl = String(fetchFn.mock.calls[0][0])
    expect(requestedUrl).toContain('/catalog-items?')
    expect(requestedUrl).toContain('kind=service')
    expect(requestedUrl).toContain('active=true')
    expect(requestedUrl).toContain('limit=20')
    expect(requestedUrl).toContain('offset=40')
    expect(requestedUrl).toContain(`q=${encodeURIComponent('štampa')}`)
  })

  it('returns the organization settings from /settings', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ firmName: 'Grafika Čobanović' }))
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(client.getSettings()).resolves.toEqual({ firmName: 'Grafika Čobanović' })
    expect(String(fetchFn.mock.calls[0][0])).toContain('/settings')
  })

  it('returns delete business failures without throwing when the backend responds with success false', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({ success: false, message: 'Radni nalog nije pronađen.' }),
    )
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(client.deleteWorkOrder('missing')).resolves.toEqual({
      success: false,
      message: 'Radni nalog nije pronađen.',
    })
  })

  it('throws a stable Serbian message when the backend is unreachable', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const client = createIrisApiClient({ baseUrl: 'http://localhost:8080', fetchFn })

    await expect(client.getWorkOrders()).rejects.toThrow(
      'Backend servis nije dostupan. Proverite da li je Iris API pokrenut.',
    )
  })
})