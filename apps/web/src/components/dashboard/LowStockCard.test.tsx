// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { LowStockCard } from './LowStockCard'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const low = {
  catalogItemId: 'cat-5',
  code: 'ART-3',
  name: 'Boja CMYK',
  unit: 'kg',
  isActive: true,
  onHand: 8,
  reserved: 2,
  available: 6,
  minStock: 10,
  low: true,
  lastMovementAt: null,
}

describe('LowStockCard', () => {
  it('links to the filtered warehouse list when something is low', async () => {
    const getStockLevels = vi.fn().mockResolvedValue({ items: [low], total: 1 })
    vi.stubGlobal('api', { getStockLevels })
    render(<MemoryRouter><LowStockCard /></MemoryRouter>)
    expect(await screen.findByText('Artikala ispod minimuma: 1')).toBeInTheDocument()
    expect(getStockLevels).toHaveBeenCalledWith({ lowOnly: true, limit: 4 })
    expect(screen.getByText('Boja CMYK')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Otvori magacin/ })).toHaveAttribute('href', '/stock?low=1')
  })

  it('says all is fine without low articles and hides itself on errors', async () => {
    vi.stubGlobal('api', { getStockLevels: vi.fn().mockResolvedValue({ items: [], total: 0 }) })
    render(<MemoryRouter><LowStockCard /></MemoryRouter>)
    expect(await screen.findByText('Sve zalihe su u redu.')).toBeInTheDocument()
    cleanup()

    vi.stubGlobal('api', { getStockLevels: vi.fn().mockRejectedValue(new Error('x')) })
    const { container } = render(<MemoryRouter><LowStockCard /></MemoryRouter>)
    await vi.waitFor(() => expect(window.api.getStockLevels).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
