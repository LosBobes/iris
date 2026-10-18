// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import Page from './SettingsPage'
import { AuthContext } from '@/contexts/AuthContext'
import { sr } from '@/i18n/locales/sr'
import { ALL_MODULES, NO_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

// Every other card is irrelevant here (and brings its own requests).
vi.mock('@/components/settings/InstallAppSettings', () => ({ InstallAppSettings: () => null }))
vi.mock('@/components/settings/LoginLogoSettings', () => ({ LoginLogoSettings: () => null }))
vi.mock('@/components/settings/EnumValuesSettings', () => ({ EnumValuesSettings: () => null }))
vi.mock('@/components/settings/ListDensitySettings', () => ({ ListDensitySettings: () => null }))
vi.mock('@/components/settings/OrganizationNameSettings', () => ({ OrganizationNameSettings: () => null }))
vi.mock('@/components/settings/PdfSectionsSettings', () => ({ PdfSectionsSettings: () => null }))
vi.mock('@/components/settings/PrintItemColumnsSettings', () => ({ PrintItemColumnsSettings: () => null }))
vi.mock('@/components/settings/BillingDefaultsSettings', () => ({ BillingDefaultsSettings: () => null }))
vi.mock('@/components/settings/PriorityDefaultsSettings', () => ({ PriorityDefaultsSettings: () => null }))
vi.mock('@/components/settings/ShippingOptionsSettings', () => ({ ShippingOptionsSettings: () => null }))
vi.mock('@/hooks/useFontScale', () => ({ useFontScale: () => ({ scale: 1, setScale: vi.fn() }) }))
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SettingsPage "Procesi rada" section and modules', () => {
  it.each([
    [NO_MODULES, false],
    [STOCK_ONLY, false],
    [ALL_MODULES, true],
  ])('with %j the section is shown: %s and templates are fetched only then', async (modules, shown) => {
    const getProcessTemplates = vi.fn().mockResolvedValue([])
    vi.stubGlobal('api', { getProcessTemplates })
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'admin', role: 'admin' }, onLogout: vi.fn() }}>
          <WithModules modules={modules}>
            <Page />
          </WithModules>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    const heading = sr.process.templates.title
    if (shown) {
      expect(await screen.findByText(heading)).toBeInTheDocument()
      expect(getProcessTemplates).toHaveBeenCalled()
    } else {
      expect(screen.queryByText(heading)).not.toBeInTheDocument()
      expect(getProcessTemplates).not.toHaveBeenCalled()
    }
  })
})
