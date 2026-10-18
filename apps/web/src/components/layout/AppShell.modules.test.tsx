// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from './AppShell'
import { AuthContext } from '@/contexts/AuthContext'
import { sr } from '@/i18n/locales/sr'
import { ALL_MODULES, NO_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderShell(modules: typeof ALL_MODULES) {
  vi.stubGlobal('api', { getWorkOrders: vi.fn().mockResolvedValue({ items: [], total: 0 }) })
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  )
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'a', role: 'admin' }, onLogout: vi.fn() }}>
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
})
