// @vitest-environment jsdom
import { waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys, withQueryInvalidation } from '@/lib/query-client'
import { useEnumValues } from '@/hooks/useEnumValues'
import { createTestQueryClient, renderHookWithQueryClient } from '@/test/query'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('query cache', () => {
  it('serves every useEnumValues caller from one request', async () => {
    const getEnumValues = vi.fn(async () => [])
    window.api = { getEnumValues } as unknown as Window['api']
    const client = createTestQueryClient()
    const first = renderHookWithQueryClient(() => useEnumValues(), { client })
    const second = renderHookWithQueryClient(() => useEnumValues(), { client })
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getEnumValues).toHaveBeenCalledTimes(1)
  })

  it('invalidates enum values after an enum edit', async () => {
    const client = createTestQueryClient()
    const api = withQueryInvalidation(
      { createEnumValue: vi.fn(async () => ({})) } as unknown as Window['api'],
      client,
    )
    client.setQueryData(queryKeys.enumValues, [])
    await api.createEnumValue({ field: 'priority', value: 'x', label: 'X' } as never)
    expect(client.getQueryState(queryKeys.enumValues)?.isInvalidated).toBe(true)
  })

  it('invalidates catalog items (stock) after a process save', async () => {
    const client = createTestQueryClient()
    const api = withQueryInvalidation(
      {
        updateWorkOrderProcess: vi.fn(async () => ({})),
        applyProcessTemplate: vi.fn(async () => ({})),
        deleteWorkOrderProcess: vi.fn(async () => undefined),
      } as unknown as Window['api'],
      client,
    )
    for (const call of [
      () => api.updateWorkOrderProcess('1', {} as never),
      () => api.applyProcessTemplate('1', 't' as never),
      () => api.deleteWorkOrderProcess('1'),
    ]) {
      client.setQueryData(queryKeys.catalogItemList({}), [])
      client.setQueryData(queryKeys.workOrder('1'), { id: '1' })
      await call()
      expect(client.getQueryState(queryKeys.catalogItemList({}))?.isInvalidated).toBe(true)
      expect(client.getQueryState(queryKeys.workOrder('1'))?.isInvalidated).toBe(true)
    }
  })

  it('drops all tenant-scoped data on logout', async () => {
    const client = createTestQueryClient()
    const api = withQueryInvalidation(
      { logout: vi.fn(async () => undefined) } as unknown as Window['api'],
      client,
    )
    client.setQueryData(queryKeys.workOrder('1'), { id: '1' })
    client.setQueryData(queryKeys.settings, { firmName: 'A' })
    await api.logout()
    expect(client.getQueryData(queryKeys.workOrder('1'))).toBeUndefined()
    expect(client.getQueryData(queryKeys.settings)).toBeUndefined()
  })
})
