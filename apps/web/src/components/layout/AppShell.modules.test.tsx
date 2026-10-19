// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
// Pages read cached queries, so each render gets a fresh QueryClient.
import { renderWithQueryClient as render } from '@/test/query'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from './AppShell'
import { AuthContext } from '@/contexts/AuthContext'
import { sr } from '@/i18n/locales/sr'
import { ALL_MODULES, NO_MODULES, PLANNING_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderShell(modules: typeof ALL_MODULES, role: 'admin' | 'user' = 'admin') {
  vi.stubGlobal('api', { getWorkOrders: vi.fn().mockResolvedValue({ items: [], total: 0 }) })
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  )
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'a', role }, onLogout: vi.fn() }}>
        <WithModules modules={modules}>
          <TooltipProvider>
            <AppShell>
              <div />
            </AppShell>
          </TooltipProvider>
        </WithModules>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('AppShell navigation and modules', () => {
  it.each([
    [NO_MODULES, false],
    [STOCK_ONLY, true],
    [ALL_MODULES, true],
  ])('shows the Magacin item only when stock is on (%j)', (modules, visible) => {
    renderShell(modules)
    expect(screen.getAllByRole('link', { name: sr.nav.catalog }).length).toBeGreaterThan(0)
    const stock = screen.queryAllByRole('link', { name: sr.nav.stock })
    expect(stock.length > 0).toBe(visible)
  })

  it.each([
    [ALL_MODULES, 'admin', false, false],
    [PLANNING_MODULES, 'admin', true, true],
    [PLANNING_MODULES, 'user', false, true],
  ] as const)('planning nav with %j for %s: Planiranje %s, Moj red %s', (modules, role, planning, queue) => {
    renderShell(modules, role)
    expect(screen.queryAllByRole('link', { name: sr.nav.planning }).length > 0).toBe(planning)
    const mine = screen.queryAllByRole('link', { name: sr.nav.myQueue })
    expect(mine.length > 0).toBe(queue)
    if (queue) expect(mine[0]).toHaveAttribute('href', '/planning/my-queue')
  })
})
