// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData } from '@/types/dashboard'
import { useDashboardData } from './useDashboardData'

const authState = { currentUser: { id: 'u1', username: 'admin', role: 'admin' as const } }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }))

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    hasOrders: true,
    summary: {
      totalOrders: 2,
      statusCounts: { new: 1, assigned: 1, inProgress: 0, completed: 0, invoiced: 0, cancelled: 0 },
      totalRevenue: 300,
    },
    monthlyBuckets: [{ month: '2026-06', count: 2, revenue: 300 }],
    deliveryDistribution: [],
    topClients: [],
    finance: {
      profitTotals: { service: 10, article: 5, total: 15 },
      revenue: 300,
      monthlyProfit: [],
      companyProfit: [],
      itemProfit: { services: [], articles: [] },
    },
    signalCounts: { overdue: 0, dueToday: 0, dueThisWeek: 0, unassigned: 0 },
    clientAttentionRows: [],
    internalAttentionRows: [],
    queueSummary: { today: 0, overdue: 0, unassigned: 0 },
    operatorQueue: { assignedToMe: 0, dueToday: 0, overdue: 0, inProgress: 0, available: 0 },
    ...overrides,
  } as DashboardData
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDashboardData', () => {
  it('loads aggregates from the API instead of every work order', async () => {
    const getDashboard = vi.fn(async () => dashboard())
    const getWorkOrders = vi.fn()
    vi.stubGlobal('api', {
      getDashboard,
      getWorkOrders,
      getWorkOrderOperators: vi.fn(async () => ['marko']),
    })

    const { result } = renderHook(() => useDashboardData())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(getWorkOrders).not.toHaveBeenCalled()
    expect(getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: null,
        dateTo: null,
        issuedBy: null,
        companyKey: null,
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    expect(result.current.monthlyOrders).toEqual([{ month: '2026-06', count: 2 }])
    expect(result.current.profitTotals.total).toBe(15)
    expect(result.current.showFinance).toBe(true)
    expect(result.current.hasSourceData).toBe(true)
    await waitFor(() => expect(result.current.operators).toEqual(['marko']))
  })

  it('refetches with the new filters and company scope', async () => {
    const getDashboard = vi.fn(async () => dashboard())
    vi.stubGlobal('api', { getDashboard, getWorkOrderOperators: vi.fn(async () => []) })

    const { result } = renderHook(() => useDashboardData())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setFilters({ dateFrom: '2026-01-01', dateTo: null, issuedBy: 'ana' })
    })
    await waitFor(() =>
      expect(getDashboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: '2026-01-01', issuedBy: 'ana' }),
      ),
    )

    act(() => {
      result.current.setSelectedCompanyKey('c1')
    })
    await waitFor(() =>
      expect(getDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ companyKey: 'c1' })),
    )
  })

  it('hides finance when the API withholds it', async () => {
    vi.stubGlobal('api', {
      getDashboard: vi.fn(async () => dashboard({ finance: null })),
      getWorkOrderOperators: vi.fn(async () => []),
    })
    const { result } = renderHook(() => useDashboardData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.showFinance).toBe(false)
    expect(result.current.profitTotals).toEqual({ service: 0, article: 0, total: 0 })
  })

  it('surfaces API errors', async () => {
    vi.stubGlobal('api', {
      getDashboard: vi.fn(async () => {
        throw new Error('boom')
      }),
      getWorkOrderOperators: vi.fn(async () => []),
    })
    const { result } = renderHook(() => useDashboardData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
  })
})
