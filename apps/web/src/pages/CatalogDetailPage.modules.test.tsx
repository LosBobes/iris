// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
// Pages read cached queries, so each render gets a fresh QueryClient.
import { renderWithQueryClient as render } from '@/test/query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import CatalogDetailPage from './CatalogDetailPage'
import { AuthContext } from '@/contexts/AuthContext'
import { sr } from '@/i18n/locales/sr'
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

describe('CatalogDetailPage stock details and modules', () => {
  it.each([
    [NO_MODULES, false],
    [STOCK_ONLY, true],
    [ALL_MODULES, true],
  ])('with %j stock on hand, min stock and the history link are shown: %s', async (modules, shown) => {
    vi.stubGlobal('api', {
      getCatalogItemById: vi.fn().mockResolvedValue(article),
      getCatalogItemCostHistory: vi.fn().mockResolvedValue([]),
      getEnumValues: vi.fn().mockResolvedValue([]),
    })
    const router = createMemoryRouter(
      [
        {
          path: '/catalog/:id',
          element: (
            <AuthContext.Provider value={{ currentUser: { id: 'u', username: 'admin', role: 'admin' }, onLogout: vi.fn() }}>
              <WithModules modules={modules}>
                <CatalogDetailPage />
              </WithModules>
            </AuthContext.Provider>
          ),
        },
      ],
      { initialEntries: ['/catalog/cat-4'] },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByDisplayValue('Papir 80g A3')).toBeInTheDocument()
    expect(screen.queryByTestId('catalog-detail-stock') !== null).toBe(shown)
    expect(screen.queryByText(sr.catalog.detail.minStockField) !== null).toBe(shown)
    expect(screen.queryByTitle(sr.catalog.detail.stockHistory) !== null).toBe(shown)
  })
})
