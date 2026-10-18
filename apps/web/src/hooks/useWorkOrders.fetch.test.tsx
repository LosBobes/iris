// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkOrders } from './useWorkOrders'

vi.mock('@/hooks/useColumnVisibility', () => ({
  useColumnVisibility: () => ({ visibleColumnSet: undefined }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function stubApi() {
  const getWorkOrders = vi.fn(async () => ({ items: [], total: 0 }))
  vi.stubGlobal('api', { getWorkOrders })
  window.api = { getWorkOrders } as unknown as Window['api']
  return getWorkOrders
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useWorkOrders fetching', () => {
  it('loads every order for the main list', async () => {
    const getWorkOrders = stubApi()
    const { result } = renderHook(() => useWorkOrders(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getWorkOrders).toHaveBeenCalledWith({ view: 'summary' })
  })

  it('asks the API for only the cost-review queue when told to', async () => {
    const getWorkOrders = stubApi()
    const { result } = renderHook(() => useWorkOrders({ needsCostReview: true }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getWorkOrders).toHaveBeenCalledWith({
      view: 'summary',
      needsCostReview: true,
    })
  })
})
