// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import CatalogPage from './CatalogPage'
import { AuthContext } from '@/contexts/AuthContext'
import { ALL_MODULES, NO_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const article = {
  id: 'cat-4',
  code: 'ART-1',
  name: 'Papir 80g A3',
  kind: 'article',
  unit: 'tabak',
  purchasePrice: 1,
  salePrice: 2,
  isActive: true,
  stockOnHand: 620,
  minStock: 5,
}

describe('CatalogPage stock line and modules', () => {
  it.each([
    [NO_MODULES, false],
    [STOCK_ONLY, true],
    [ALL_MODULES, true],
  ])('with %j the "Na stanju" line is shown: %s', async (modules, shown) => {
    vi.stubGlobal('api', { getCatalogItems: vi.fn().mockResolvedValue({ items: [article], total: 1 }) })
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'admin', role: 'admin' }, onLogout: vi.fn() }}>
          <WithModules modules={modules}>
            <CatalogPage />
          </WithModules>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Papir 80g A3')).toBeInTheDocument()
    expect(screen.queryByTestId('catalog-stock') !== null).toBe(shown)
  })

  it('does not show a stock line when the API reports null (stock off server-side)', async () => {
    vi.stubGlobal('api', {
      getCatalogItems: vi.fn().mockResolvedValue({ items: [{ ...article, stockOnHand: null }], total: 1 }),
    })
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'admin', role: 'admin' }, onLogout: vi.fn() }}>
          <WithModules modules={ALL_MODULES}>
            <CatalogPage />
          </WithModules>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Papir 80g A3')).toBeInTheDocument()
    expect(screen.queryByTestId('catalog-stock')).not.toBeInTheDocument()
  })
})
