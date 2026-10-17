// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import StockHistoryPage from './StockHistoryPage'
import '@/i18n'
import type { StockMovement } from '@/types/stock'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const item = {
  id: 'cat-4',
  code: 'ART-2',
  name: 'Papir 80g A3',
  kind: 'article' as const,
  unit: 'tabak',
  purchasePrice: null,
  salePrice: null,
  barcode: null,
  taxGroup: null,
  description: null,
  isActive: true,
  stockOnHand: 520,
  minStock: 200,
}

function movement(id: string, patch: Partial<StockMovement>): StockMovement {
  return {
    id,
    catalogItemId: 'cat-4',
    itemCode: 'ART-2',
    itemName: 'Papir 80g A3',
    unit: 'tabak',
    kind: 'opening',
    quantity: 620,
    workOrderId: null,
    workOrderNumber: null,
    processNodeId: null,
    documentRef: null,
    note: null,
    createdAt: '2026-03-01T10:00:00Z',
    createdBy: 'admin',
    ...patch,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/stock/cat-4']}>
      <Routes>
        <Route path="/stock/:catalogItemId" element={<StockHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StockHistoryPage', () => {
  it('lists movements newest first with kind badges, signed quantities and order links', async () => {
    vi.stubGlobal('api', {
      getCatalogItemById: vi.fn().mockResolvedValue(item),
      getStockLevels: vi.fn().mockResolvedValue({
        items: [
          {
            catalogItemId: 'cat-4', code: 'ART-2', name: 'Papir 80g A3', unit: 'tabak', isActive: true,
            onHand: 520, reserved: 0, available: 520, minStock: 200, low: false, lastMovementAt: null,
          },
        ],
        total: 1,
      }),
      getStockMovements: vi.fn().mockResolvedValue({
        items: [
          movement('m2', { kind: 'consumption', quantity: -100, workOrderId: '7', workOrderNumber: 'RN-2026-00007' }),
          movement('m1', { kind: 'receipt', quantity: 50, documentRef: 'OT-15' }),
          movement('m0', { kind: 'opening' }),
        ],
        total: 3,
      }),
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Promet: Papir 80g A3' })).toBeInTheDocument()
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Utrošak')).toBeInTheDocument()
    expect(within(rows[0]).getByText('-100 tabak')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('link', { name: 'RN-2026-00007' })).toHaveAttribute('href', '/work-orders/7')
    expect(within(rows[1]).getByText('Prijem')).toBeInTheDocument()
    expect(within(rows[1]).getByText('+50 tabak')).toBeInTheDocument()
    expect(within(rows[1]).getByText('OT-15')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Početno stanje')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stavka kataloga' })).toHaveAttribute('href', '/catalog/cat-4')
  })

  it('shows not found for a service or unknown id', async () => {
    vi.stubGlobal('api', { getCatalogItemById: vi.fn().mockResolvedValue(null) })
    renderPage()
    expect(await screen.findByText('Artikal nije pronađen u magacinu.')).toBeInTheDocument()
  })
})
