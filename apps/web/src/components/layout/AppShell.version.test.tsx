// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithQueryClient as render } from '@/test/query'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from './AppShell'
import { AuthContext } from '@/contexts/AuthContext'
import { APP_VERSION, formatVersion } from '@/lib/app-version'
import { sr } from '@/i18n/locales/sr'
import { NO_MODULES, WithModules } from '@/test/modules'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderShell(isDesktop: boolean) {
  vi.stubGlobal('api', { getWorkOrders: vi.fn().mockResolvedValue({ items: [], total: 0 }) })
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: isDesktop, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  )
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'operater', role: 'user' }, onLogout: vi.fn() }}>
        <WithModules modules={NO_MODULES}>
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

describe('AppShell version', () => {
  it.each([
    ['desktop sidebar', true],
    ['mobile drawer', false],
  ])('shows the app version under the user menu (%s)', (_, isDesktop) => {
    renderShell(isDesktop)
    const version = screen.getByTestId('app-version')
    expect(version).toHaveTextContent(`Iris ${formatVersion(APP_VERSION)}`)
    expect(version).toHaveAttribute('title', sr.shell.appVersion)
    // It lives in the sidebar, which is also the mobile drawer.
    expect(version.closest('#app-sidebar')).not.toBeNull()
  })
})
