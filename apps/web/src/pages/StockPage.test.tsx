// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import StockPage from './StockPage'
import { AuthContext } from '@/contexts/AuthContext'
import '@/i18n'
import type { StockLevel } from '@/types/stock'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

function level(id: string, name: string, extra: Partial<StockLevel> = {}): StockLevel {
  return {
    catalogItemId: id,
    code: `ART-${id}`,
    name,
    unit: 'tabak',
    isActive: true,
    onHand: 620,
    reserved: 100,
    available: 520,
    minStock: 200,
    low: false,
    lastMovementAt: '2026-03-01T10:00:00Z',
    ...extra,
  }
}

const levels = [
  level('1', 'Papir 80g A3'),
  level('2', 'Boja CMYK', { unit: 'kg', onHand: 8, reserved: 2, available: 6, minStock: 10, low: true }),
  level('3', 'Offset ploča', { unit: 'kom', onHand: -2, reserved: 0, available: -2, low: true, minStock: null }),
]

function LocationProbe(): React.JSX.Element {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderPage(options: { role?: 'admin' | 'user'; path?: string; table?: boolean } = {}) {
  const { role = 'admin', path = '/stock', table = true } = options
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: table,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  return render(
    <AuthContext value={{ currentUser: { id: '1', username: 'admin', role }, onLogout: () => {} }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/stock" element={<StockPage />} />
          <Route path="/stock/:catalogItemId" element={<div>history</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext>,
  )
}

function stubApi(getStockLevels = vi.fn()) {
  getStockLevels.mockImplementation(async (query: { search?: string; lowOnly?: boolean } = {}) => {
    let items = levels
    if (query.lowOnly) items = items.filter((item) => item.low)
    if (query.search) items = items.filter((item) => item.name.toLowerCase().includes(query.search!.toLowerCase()))
    return { items, total: items.length }
  })
  vi.stubGlobal('api', { getStockLevels })
  return getStockLevels
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StockPage', () => {
  it('renders stock rows with unit-qualified numbers and highlights low and negative rows', async () => {
    stubApi()
    renderPage()

    const paper = (await screen.findByRole('link', { name: 'Papir 80g A3' })).closest('tr') as HTMLElement
    expect(within(paper).getByText('ART-1')).toBeInTheDocument()
    expect(paper).toHaveTextContent('620 tabak')
    expect(paper).toHaveTextContent('100 tabak')
    expect(paper).toHaveTextContent('520 tabak')
    expect(paper).toHaveTextContent('200 tabak')
    expect(paper).not.toHaveAttribute('data-low')

    const ink = screen.getByRole('link', { name: 'Boja CMYK' }).closest('tr') as HTMLElement
    expect(ink).toHaveAttribute('data-low', 'true')
    expect(ink).toHaveTextContent('Niska zaliha')

    const plates = screen.getByRole('link', { name: 'Offset ploča' }).closest('tr') as HTMLElement
    expect(plates).toHaveAttribute('data-negative', 'true')
    expect(plates).toHaveTextContent('Negativno stanje')
    for (const cell of within(plates).getAllByText('-2 kom')) expect(cell).toHaveClass('text-destructive')
  })

  it('searches and filters low stock only', async () => {
    const user = userEvent.setup()
    const getStockLevels = stubApi()
    renderPage()
    await screen.findByRole('link', { name: 'Papir 80g A3' })

    await user.click(screen.getByRole('checkbox', { name: 'Samo niske zalihe' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Papir 80g A3' })).not.toBeInTheDocument())
    expect(getStockLevels).toHaveBeenLastCalledWith(expect.objectContaining({ lowOnly: true }))
    expect(screen.getByTestId('location')).toHaveTextContent('/stock?low=1')

    await user.click(screen.getByRole('checkbox', { name: 'Samo niske zalihe' }))
    await user.type(screen.getByRole('searchbox', { name: 'Pretraga magacina' }), 'boja')
    await waitFor(() => expect(getStockLevels).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'boja' })))
    expect(await screen.findByRole('link', { name: 'Boja CMYK' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Offset ploča' })).not.toBeInTheDocument()
  })

  it('starts with the low filter from the dashboard link', async () => {
    const getStockLevels = stubApi()
    renderPage({ path: '/stock?low=1' })
    await screen.findByRole('link', { name: 'Boja CMYK' })
    expect(screen.getByRole('checkbox', { name: 'Samo niske zalihe' })).toBeChecked()
    expect(getStockLevels).toHaveBeenCalledWith(expect.objectContaining({ lowOnly: true }))
    expect(screen.queryByRole('link', { name: 'Papir 80g A3' })).not.toBeInTheDocument()
  })

  it('opens the movement history when a row is clicked', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Papir 80g A3' })).closest('tr') as HTMLElement
    await user.click(within(row).getByText('ART-1'))
    expect(screen.getByTestId('location')).toHaveTextContent('/stock/1')
  })

  it('shows the stocktake action to admins only', async () => {
    stubApi()
    const { unmount } = renderPage({ role: 'admin' })
    await screen.findByRole('link', { name: 'Papir 80g A3' })
    expect(screen.getByRole('button', { name: 'Popis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijem robe' })).toBeInTheDocument()
    unmount()

    renderPage({ role: 'user' })
    await screen.findByRole('link', { name: 'Papir 80g A3' })
    expect(screen.queryByRole('button', { name: 'Popis' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijem robe' })).toBeInTheDocument()
  })

  it('renders cards on narrow screens', async () => {
    stubApi()
    renderPage({ table: false })
    const card = (await screen.findByText('Boja CMYK')).closest('li') as HTMLElement
    expect(card).toHaveAttribute('data-low', 'true')
    expect(card).toHaveTextContent('8 kg')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the empty and error states', async () => {
    vi.stubGlobal('api', { getStockLevels: vi.fn().mockResolvedValue({ items: [], total: 0 }) })
    renderPage()
    expect(await screen.findByText(/Još nema artikala u magacinu/)).toBeInTheDocument()
    cleanup()

    vi.stubGlobal('api', { getStockLevels: vi.fn().mockRejectedValue(new Error('boom')) })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Greška pri učitavanju magacina')
  })
})
