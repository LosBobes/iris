// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { StockReceiptDialog } from './StockReceiptDialog'
import { ApiError } from '@/lib/errors'
import '@/i18n'
import type { CatalogItem } from '@/types/catalog'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

function article(id: string, name: string, stockOnHand: number): CatalogItem {
  return {
    id,
    code: id.toUpperCase(),
    name,
    kind: 'article',
    unit: 'tabak',
    purchasePrice: null,
    salePrice: null,
    barcode: null,
    taxGroup: null,
    description: null,
    isActive: true,
    stockOnHand,
  }
}

const paper = article('cat-4', 'Papir 80g A3', 620)
const ink = article('cat-5', 'Boja CMYK', 8)

function setup(overrides: Record<string, unknown> = {}) {
  const postStockReceipt = vi.fn().mockResolvedValue({ movements: [{ id: 'm1' }] })
  vi.stubGlobal('api', {
    postStockReceipt,
    getCatalogItems: vi.fn().mockResolvedValue({ items: [paper, ink], total: 2 }),
    ...overrides,
  })
  const onOpenChange = vi.fn()
  const onPosted = vi.fn()
  render(<StockReceiptDialog open onOpenChange={onOpenChange} onPosted={onPosted} />)
  return { postStockReceipt, onOpenChange, onPosted }
}

async function addArticle(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name: 'Dodaj artikal' }))
  await user.click(await screen.findByRole('button', { name }))
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StockReceiptDialog', () => {
  it('requires at least one line and does not call the API', async () => {
    const user = userEvent.setup()
    const { postStockReceipt } = setup()
    await user.click(screen.getByRole('button', { name: 'Evidentiraj prijem' }))
    expect(await screen.findByText('Dodajte bar jednu stavku.')).toBeInTheDocument()
    expect(postStockReceipt).not.toHaveBeenCalled()
  })

  it('rejects an empty or non-positive quantity', async () => {
    const user = userEvent.setup()
    const { postStockReceipt } = setup()
    await addArticle(user, /Papir 80g A3/)

    await user.click(screen.getByRole('button', { name: 'Evidentiraj prijem' }))
    expect(await screen.findByText('Količina mora biti veća od nule.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Količina: Papir 80g A3'), '0')
    await user.click(screen.getByRole('button', { name: 'Evidentiraj prijem' }))
    expect(await screen.findByText('Količina mora biti veća od nule.')).toBeInTheDocument()
    expect(postStockReceipt).not.toHaveBeenCalled()
  })

  it('rejects a duplicated article', async () => {
    const user = userEvent.setup()
    const { postStockReceipt } = setup()
    await addArticle(user, /Papir 80g A3/)
    await addArticle(user, /Papir 80g A3/)
    for (const input of screen.getAllByLabelText('Količina: Papir 80g A3')) await user.type(input, '5')
    await user.click(screen.getByRole('button', { name: 'Evidentiraj prijem' }))
    expect(await screen.findByText('Artikal se ponavlja.')).toBeInTheDocument()
    expect(postStockReceipt).not.toHaveBeenCalled()
  })

  it('previews the resulting on-hand per line and submits several lines', async () => {
    const user = userEvent.setup()
    const { postStockReceipt, onPosted, onOpenChange } = setup()
    await user.type(screen.getByLabelText('Broj dokumenta'), '  OT-15 ')
    await addArticle(user, /Papir 80g A3/)
    await addArticle(user, /Boja CMYK/)

    await user.type(screen.getByLabelText('Količina: Papir 80g A3'), '50')
    await user.type(screen.getByLabelText('Količina: Boja CMYK'), '2,5')
    const previews = screen.getAllByTestId('receipt-preview').map((node) => node.textContent)
    expect(previews).toEqual(['Stanje posle prijema: 670 tabak', 'Stanje posle prijema: 10,5 tabak'])

    await user.click(screen.getByRole('button', { name: 'Evidentiraj prijem' }))
    await waitFor(() =>
      expect(postStockReceipt).toHaveBeenCalledWith({
        documentRef: 'OT-15',
        note: undefined,
        lines: [
          { catalogItemId: 'cat-4', quantity: 50 },
          { catalogItemId: 'cat-5', quantity: 2.5 },
        ],
      }),
    )
    expect(toastSuccess).toHaveBeenCalledWith('Prijem je evidentiran (stavki: 1).')
    expect(onPosted).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('removes a line and surfaces API errors', async () => {
    const user = userEvent.setup()
    const failure = new ApiError('Artikal nije pronađen u katalogu.', { status: 422, url: 'http://x/stock/receipts' })
    const postStockReceipt = vi.fn().mockRejectedValue(failure)
    const { onPosted } = setup({ postStockReceipt })
    await addArticle(user, /Papir 80g A3/)
    await user.click(screen.getByRole('button', { name: 'Ukloni stavku Papir 80g A3' }))
    expect(screen.queryByLabelText('Količina: Papir 80g A3')).not.toBeInTheDocument()

    await addArticle(user, /Boja CMYK/)
    await user.type(screen.getByLabelText('Količina: Boja CMYK'), '1')
    await user.click(screen.getByRole('button', { name: 'Evidentiraj prijem' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0][0]).toContain('Artikal nije pronađen u katalogu.')
    expect(postStockReceipt).toHaveBeenCalledTimes(1)
    expect(onPosted).not.toHaveBeenCalled()
  })
})
