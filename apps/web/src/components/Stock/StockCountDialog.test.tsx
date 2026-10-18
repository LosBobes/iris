// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { StockCountDialog } from './StockCountDialog'
import '@/i18n'
import type { StockLevel } from '@/types/stock'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

function level(id: string, name: string, onHand: number, lastMovementAt: string | null): StockLevel {
  return {
    catalogItemId: id,
    code: id,
    name,
    unit: 'kom',
    isActive: true,
    onHand,
    reserved: 0,
    available: onHand,
    minStock: null,
    low: false,
    lastMovementAt,
  }
}

const levels = [
  level('a', 'Papir', 620, '2026-03-01T10:00:00Z'),
  level('b', 'Boja', 8, '2026-03-01T10:00:00Z'),
  level('c', 'Novi artikal', 0, null),
]

function setup() {
  const postStockCount = vi.fn().mockResolvedValue({ movements: [{ id: 'm1' }, { id: 'm2' }] })
  vi.stubGlobal('api', {
    getStockLevels: vi.fn().mockResolvedValue({ items: levels, total: levels.length }),
    postStockCount,
  })
  const onPosted = vi.fn()
  const onOpenChange = vi.fn()
  render(<StockCountDialog open onOpenChange={onOpenChange} onPosted={onPosted} />)
  return { postStockCount, onPosted, onOpenChange }
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StockCountDialog', () => {
  it('prefills counted quantities with the recorded stock and books nothing until something differs', async () => {
    setup()
    expect(await screen.findByLabelText('Izbrojana količina: Papir')).toHaveValue('620')
    expect(screen.getByLabelText('Izbrojana količina: Boja')).toHaveValue('8')
    expect(screen.getByText('Nema razlika za knjiženje.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proknjiži popis' })).toBeDisabled()
  })

  it('shows deltas, marks opening balances and submits only changed lines', async () => {
    const user = userEvent.setup()
    const { postStockCount, onPosted } = setup()
    const paper = await screen.findByLabelText('Izbrojana količina: Papir')
    await user.clear(paper)
    await user.type(paper, '600')
    const fresh = screen.getByLabelText('Izbrojana količina: Novi artikal')
    await user.clear(fresh)
    await user.type(fresh, '12,5')

    const paperRow = paper.closest('tr') as HTMLElement
    expect(paperRow).toHaveTextContent('-20 kom')
    expect(within(paperRow).queryByText('Početno stanje')).not.toBeInTheDocument()
    const freshRow = fresh.closest('tr') as HTMLElement
    expect(freshRow).toHaveTextContent('+12,5 kom')
    expect(within(freshRow).getByText('Početno stanje')).toBeInTheDocument()
    expect(screen.getByText('Izmenjeno stavki: 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Proknjiži popis' }))
    await waitFor(() =>
      expect(postStockCount).toHaveBeenCalledWith({
        note: undefined,
        lines: [
          { catalogItemId: 'a', countedQuantity: 600 },
          { catalogItemId: 'c', countedQuantity: 12.5 },
        ],
      }),
    )
    expect(toastSuccess).toHaveBeenCalledWith('Popis je proknjižen (promena: 2).')
    expect(onPosted).toHaveBeenCalled()
  })

  it('blocks negative quantities', async () => {
    const user = userEvent.setup()
    const { postStockCount } = setup()
    const paper = await screen.findByLabelText('Izbrojana količina: Papir')
    await user.clear(paper)
    await user.type(paper, '-3')
    expect(await screen.findByText('Količina ne može biti negativna.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proknjiži popis' })).toBeDisabled()
    expect(postStockCount).not.toHaveBeenCalled()
  })

  it('filters the article list', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByLabelText('Izbrojana količina: Papir')
    await user.type(screen.getByLabelText('Filter artikala'), 'boj')
    expect(screen.queryByLabelText('Izbrojana količina: Papir')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Izbrojana količina: Boja')).toBeInTheDocument()
  })
})
