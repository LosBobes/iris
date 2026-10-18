// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkOrder } from './useWorkOrder'
import { TODAY_CHECK_INTERVAL_MS, useLocalToday } from './useWorkOrders'
import { queryKeys } from '@/lib/query-client'
import { createTestQueryClient, renderHookWithQueryClient } from '@/test/query'
import { makeWorkOrder } from '@/test/work-order-factory'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useWorkOrder', () => {
  it('shows the cached order at once and still refetches on mount', async () => {
    const cached = makeWorkOrder({ id: '7', clientName: 'Stari naziv' })
    const fresh = makeWorkOrder({ id: '7', clientName: 'Novi naziv' })
    const getWorkOrderById = vi.fn(async () => fresh)
    window.api = { getWorkOrderById } as unknown as Window['api']
    const client = createTestQueryClient()
    // Cached a moment ago, i.e. well inside the app's default stale time.
    client.setQueryData(queryKeys.workOrder('7'), cached)

    const { result } = renderHookWithQueryClient(() => useWorkOrder('7', { context: 'test' }), { client })
    expect(result.current.order?.clientName).toBe('Stari naziv')
    await waitFor(() => expect(result.current.order?.clientName).toBe('Novi naziv'))
    expect(getWorkOrderById).toHaveBeenCalledTimes(1)
  })
})

describe('useLocalToday', () => {
  it('rolls over at midnight while the page stays open', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 23, 59, 30))
    const { result } = renderHook(() => useLocalToday())
    expect(result.current).toBe('2026-06-10')

    act(() => {
      vi.advanceTimersByTime(TODAY_CHECK_INTERVAL_MS)
    })
    expect(result.current).toBe('2026-06-11')
  })

  it('re-reads the date when the tab regains focus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0))
    const { result } = renderHook(() => useLocalToday())
    vi.setSystemTime(new Date(2026, 5, 12, 8, 0, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBe('2026-06-12')
  })
})
