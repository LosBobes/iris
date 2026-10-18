// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkOrders } from './useWorkOrders'
import { createTestQueryClient, renderHookWithQueryClient } from '@/test/query'
import { withQueryInvalidation } from '@/lib/query-client'
import { makeWorkOrder } from '@/test/work-order-factory'

vi.mock('@/hooks/useColumnVisibility', () => ({
  useColumnVisibility: () => ({ visibleColumnSet: undefined }),
}))

function Router({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function stubApi(total = 0) {
  const getWorkOrders = vi.fn(async () => ({
    items: total > 0 ? [makeWorkOrder()] : [],
    total,
  }))
  const updateWorkOrder = vi.fn(async () => makeWorkOrder())
  window.api = { getWorkOrders, updateWorkOrder } as unknown as Window['api']
  return { getWorkOrders, updateWorkOrder }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useWorkOrders fetching', () => {
  it('asks the API for one sorted summary page plus the unfiltered count', async () => {
    const { getWorkOrders } = stubApi(120)
    const { result } = renderHookWithQueryClient(() => useWorkOrders(), { wrapper: Router })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(getWorkOrders).toHaveBeenCalledWith({
      view: 'summary',
      sort: '-orderNumber',
      limit: result.current.pageSize,
      offset: 0,
    })
    expect(getWorkOrders).toHaveBeenCalledWith({ view: 'summary', limit: 1 })
    expect(result.current.totalFiltered).toBe(120)
    expect(result.current.totalPages).toBe(Math.ceil(120 / result.current.pageSize))
  })

  it('requests the next page from the server', async () => {
    const { getWorkOrders } = stubApi(120)
    const { result } = renderHookWithQueryClient(() => useWorkOrders(), { wrapper: Router })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setCurrentPage(2))
    await waitFor(() =>
      expect(getWorkOrders).toHaveBeenCalledWith(
        expect.objectContaining({ offset: result.current.pageSize }),
      ),
    )
  })

  it('asks the API for only the cost-review queue when told to', async () => {
    const { getWorkOrders } = stubApi()
    const { result } = renderHookWithQueryClient(() => useWorkOrders({ needsCostReview: true }), {
      wrapper: Router,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getWorkOrders).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'summary', needsCostReview: true, offset: 0 }),
    )
    expect(getWorkOrders).toHaveBeenCalledWith({ view: 'summary', limit: 1, needsCostReview: true })
  })

  it('refetches the list after a work-order mutation through window.api', async () => {
    const client = createTestQueryClient()
    const { getWorkOrders } = stubApi(3)
    window.api = withQueryInvalidation(window.api, client)
    const { result } = renderHookWithQueryClient(() => useWorkOrders(), { wrapper: Router, client })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsBefore = getWorkOrders.mock.calls.length

    await act(async () => {
      await window.api.updateWorkOrder('order-1', { status: 'completed' })
    })
    await waitFor(() => expect(getWorkOrders.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})
