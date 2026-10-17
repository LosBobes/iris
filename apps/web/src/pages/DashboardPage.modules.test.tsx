// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import DashboardPage from './DashboardPage'
import { AuthContext } from '@/contexts/AuthContext'
import { ALL_MODULES, NO_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    summary: { totalOrders: 1 },
    showFinance: false,
    loading: false,
    error: null,
    hasSourceData: true,
    operatorQueue: [],
    currentUserName: 'admin',
  }),
}))
vi.mock('@/components/dashboard/OperatorQueueGrid', () => ({ OperatorQueueGrid: () => <div /> }))
vi.mock('@/components/dashboard/DashboardActionSection', () => ({ DashboardActionSection: () => <div /> }))
vi.mock('@/components/dashboard/DashboardFinanceSection', () => ({ DashboardFinanceSection: () => <div /> }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DashboardPage low-stock card and modules', () => {
  it.each([
    [NO_MODULES, false],
    [STOCK_ONLY, true],
    [ALL_MODULES, true],
  ])('with %j the card is shown: %s, and stock is requested only then', async (modules, shown) => {
    const getStockLevels = vi.fn().mockResolvedValue({ items: [], total: 0 })
    vi.stubGlobal('api', { getStockLevels })
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'admin', role: 'admin' }, onLogout: vi.fn() }}>
          <WithModules modules={modules}>
            <DashboardPage />
          </WithModules>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    if (shown) {
      expect(await screen.findByText('Sve zalihe su u redu.')).toBeInTheDocument()
      expect(getStockLevels).toHaveBeenCalledTimes(1)
    } else {
      expect(screen.queryByText('Sve zalihe su u redu.')).not.toBeInTheDocument()
      expect(getStockLevels).not.toHaveBeenCalled()
    }
  })
})
