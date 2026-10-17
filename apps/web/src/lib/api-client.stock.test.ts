import { describe, expect, it, vi } from 'vitest'
import { createHttpApi } from './api-client'

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(async () => response(body, { status }))
  return { api: createHttpApi('http://api.test', fetchMock), fetchMock }
}

describe('stock HTTP client', () => {
  it('encodes the levels query and tolerates a null list', async () => {
    const { api, fetchMock } = setup({ items: null, total: 0 })
    const result = await api.getStockLevels({ search: 'papir', lowOnly: true, limit: 25, offset: 50 })
    expect(result).toEqual({ items: [], total: 0 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/stock?search=papir&lowOnly=true&limit=25&offset=50')
    expect(init.credentials).toBe('include')
  })

  it('omits unset query values', async () => {
    const { api, fetchMock } = setup({ items: [], total: 0 })
    await api.getStockLevels()
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/stock')
    await api.getStockMovements({ catalogItemId: 'cat 4', limit: 10 })
    expect(fetchMock.mock.calls[1][0]).toBe('http://api.test/stock/movements?catalogItemId=cat+4&limit=10')
  })

  it('posts receipts and counts as JSON', async () => {
    const { api, fetchMock } = setup({ movements: [{ id: 'm1' }] }, 201)
    const receipt = { documentRef: 'OT-1', lines: [{ catalogItemId: 'cat-4', quantity: 5 }] }
    expect(await api.postStockReceipt(receipt)).toEqual({ movements: [{ id: 'm1' }] })
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/stock/receipts')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(receipt)

    const count = { lines: [{ catalogItemId: 'cat-4', countedQuantity: 3 }] }
    await api.postStockCount(count)
    expect(fetchMock.mock.calls[1][0]).toBe('http://api.test/stock/counts')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(count)
  })
})

describe('organization modules HTTP client', () => {
  it('PUTs the modules to the platform route and returns the tenant', async () => {
    const tenant = { slug: 'demo', modules: { processes: true, stock: true } }
    const { api, fetchMock } = setup(tenant)
    expect(await api.setPlatformTenantModules('de mo', { processes: true, stock: true })).toEqual(tenant)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/platform/tenants/de%20mo/modules')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ processes: true, stock: true })
  })

  it('never sends modules in updateSettings and defaults missing modules to off', async () => {
    const { api, fetchMock } = setup({ firmName: 'X' })
    const result = await api.updateSettings({ firmName: 'X', modules: { processes: true, stock: true } } as never)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ firmName: 'X' })
    expect(result.modules).toEqual({ processes: false, stock: false })
  })

  it('treats processes without stock as processes off when reading settings', async () => {
    const { api } = setup({ firmName: 'X', modules: { processes: true, stock: false } })
    expect((await api.getSettings()).modules).toEqual({ processes: false, stock: false })
  })
})
