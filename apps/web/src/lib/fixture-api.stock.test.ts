import { beforeEach, describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import type { ProcessGraph } from '@/types/process'

type Api = ReturnType<typeof createFixtureApi>

// Order "3" is open (not completed/cancelled/invoiced); "1" is completed.
const OPEN_ORDER = '3'
const CLOSED_ORDER = '1'

const PAPER = 'cat-4'
const INK = 'cat-5'
const PLATES = 'cat-6'
const WASTE = 'cat-7'

let api: Api

async function level(id: string) {
  const { items } = await api.getStockLevels({ limit: 100 })
  const found = items.find((entry) => entry.catalogItemId === id)
  if (!found) throw new Error(`no level for ${id}`)
  return found
}

async function withStep(orderId: string, stepId: string, status: 'pending' | 'done', patch?: (g: ProcessGraph) => void) {
  const process = await api.getWorkOrderProcess(orderId)
  if (!process) throw new Error('order has no process')
  const graph: ProcessGraph = structuredClone(process.graph)
  graph.nodes = graph.nodes.map((node) => (node.id === stepId ? { ...node, status } : node))
  patch?.(graph)
  return api.updateWorkOrderProcess(orderId, { graph })
}

beforeEach(async () => {
  api = createFixtureApi()
  // Each createFixtureApi() has a fresh process store and ledger.
  await api.applyProcessTemplate(OPEN_ORDER, 'pt-offset')
})

describe('fixture stock ledger', () => {
  it('seeds the demo articles with opening stock and links the default template', async () => {
    expect(await level(PAPER)).toMatchObject({ name: 'Papir 80g A3', unit: 'tabak', onHand: 620 })
    expect(await level(INK)).toMatchObject({ onHand: 8, minStock: 10, low: true })
    const [template] = await api.getProcessTemplates()
    const links = Object.fromEntries(
      template.graph.nodes.filter((node) => node.catalogItemId).map((node) => [node.id, [node.catalogItemId, node.quantity, node.unit]]),
    )
    expect(links).toEqual({
      'in-paper': [PAPER, 100, 'tabak'],
      'in-ink': [INK, 2, 'kg'],
      'in-plates': [PLATES, 4, 'kom'],
      'out-waste-ink': [WASTE, 3, 'tabak'],
    })
    // The finished product stays unlinked.
    expect(template.graph.nodes.find((node) => node.id === 'out-product')?.catalogItemId).toBeUndefined()
    const movements = await api.getStockMovements({ catalogItemId: PAPER })
    expect(movements.items.map((m) => m.kind)).toEqual(['opening'])
  })

  it('reserves planned inputs of open orders only', async () => {
    const paper = await level(PAPER)
    expect(paper.reserved).toBe(100)
    expect(paper.available).toBe(520)
    // Completed orders do not reserve.
    await api.applyProcessTemplate(CLOSED_ORDER, 'pt-offset')
    expect((await level(PAPER)).reserved).toBe(100)
  })

  it('posts consumption and production automatically when a step is done, and undoes it', async () => {
    await withStep(OPEN_ORDER, 'step-print', 'done')
    // Paper and ink are consumed by the print step, makulatura is produced by it.
    expect(await level(PAPER)).toMatchObject({ onHand: 520, reserved: 0 })
    expect(await level(INK)).toMatchObject({ onHand: 6 })
    expect(await level(WASTE)).toMatchObject({ onHand: 123 })
    // Plates feed the prep step (not done): still on hand and reserved.
    expect(await level(PLATES)).toMatchObject({ onHand: 40, reserved: 4 })

    const paperMovements = (await api.getStockMovements({ catalogItemId: PAPER })).items
    expect(paperMovements[0]).toMatchObject({
      kind: 'consumption',
      quantity: -100,
      workOrderId: OPEN_ORDER,
      processNodeId: 'in-paper',
    })
    expect(paperMovements[0].workOrderNumber).toMatch(/^RN-/)

    // Saving again changes nothing (idempotent).
    await withStep(OPEN_ORDER, 'step-print', 'done')
    expect((await api.getStockMovements({ catalogItemId: PAPER })).total).toBe(2)

    // Undo: the booking is reversed with a correction (adjustment) movement.
    await withStep(OPEN_ORDER, 'step-print', 'pending')
    expect(await level(PAPER)).toMatchObject({ onHand: 620, reserved: 100 })
    expect(await level(WASTE)).toMatchObject({ onHand: 120 })
    const after = (await api.getStockMovements({ catalogItemId: PAPER })).items
    expect(after[0]).toMatchObject({ kind: 'adjustment', quantity: 100 })
  })

  it('posts only the delta when the actual quantity changes', async () => {
    await withStep(OPEN_ORDER, 'step-print', 'done')
    await withStep(OPEN_ORDER, 'step-print', 'done', (graph) => {
      graph.nodes = graph.nodes.map((node) => (node.id === 'in-paper' ? { ...node, actualQuantity: 90 } : node))
    })
    expect((await level(PAPER)).onHand).toBe(530)
    const [latest] = (await api.getStockMovements({ catalogItemId: PAPER })).items
    expect(latest).toMatchObject({ kind: 'adjustment', quantity: 10 })
  })

  it('reverses the old article when a posted node is relinked', async () => {
    await withStep(OPEN_ORDER, 'step-print', 'done')
    const created = await api.createCatalogItem({
      code: 'ART-X', name: 'Papir 120g', kind: 'article', unit: 'tabak', purchasePrice: null, salePrice: null,
      barcode: null, taxGroup: null, description: null, isActive: true,
    })
    await withStep(OPEN_ORDER, 'step-print', 'done', (graph) => {
      graph.nodes = graph.nodes.map((node) => (node.id === 'in-paper' ? { ...node, catalogItemId: created.id } : node))
    })
    expect((await level(PAPER)).onHand).toBe(620)
    expect((await level(created.id)).onHand).toBe(-100)
    expect((await level(created.id)).low).toBe(true) // negative stock is flagged
  })

  it('records receipts and orders movements newest first', async () => {
    const result = await api.postStockReceipt({
      documentRef: 'OT-15',
      note: 'Dobavljač A',
      lines: [{ catalogItemId: PAPER, quantity: 50 }],
    })
    expect(result.movements[0]).toMatchObject({ kind: 'receipt', quantity: 50, documentRef: 'OT-15', itemName: 'Papir 80g A3' })
    expect((await level(PAPER)).onHand).toBe(670)
    const { items } = await api.getStockMovements({ catalogItemId: PAPER })
    expect(items.map((m) => m.kind)).toEqual(['receipt', 'opening'])
  })

  it('validates receipts like the API', async () => {
    await expect(api.postStockReceipt({ lines: [] })).rejects.toMatchObject({ status: 422 })
    await expect(api.postStockReceipt({ lines: [{ catalogItemId: PAPER, quantity: 0 }] })).rejects.toThrow(
      'Količina mora biti veća od nule.',
    )
    await expect(api.postStockReceipt({ lines: [{ catalogItemId: 'cat-1', quantity: 1 }] })).rejects.toThrow(
      'Artikal nije pronađen u katalogu.',
    )
    await expect(
      api.postStockReceipt({ lines: [{ catalogItemId: PAPER, quantity: 1 }, { catalogItemId: PAPER, quantity: 2 }] }),
    ).rejects.toThrow('Artikal se ponavlja.')
  })

  it('counts: adjustment when the article has movements, opening when it has none', async () => {
    const fresh = await api.createCatalogItem({
      code: 'ART-N', name: 'Novi', kind: 'article', unit: 'kom', purchasePrice: null, salePrice: null,
      barcode: null, taxGroup: null, description: null, isActive: true,
    })
    const result = await api.postStockCount({
      note: 'Godišnji popis',
      lines: [
        { catalogItemId: PAPER, countedQuantity: 600 },
        { catalogItemId: fresh.id, countedQuantity: 12 },
        { catalogItemId: PLATES, countedQuantity: 40 }, // unchanged: no movement
      ],
    })
    expect(result.movements.map((m) => [m.catalogItemId, m.kind, m.quantity])).toEqual([
      [PAPER, 'adjustment', -20],
      [fresh.id, 'opening', 12],
    ])
    expect((await level(PAPER)).onHand).toBe(600)
    await expect(api.postStockCount({ lines: [{ catalogItemId: PAPER, countedQuantity: -1 }] })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('lets operators receive goods but not count', async () => {
    await api.login({ username: 'user', password: 'user123' })
    try {
      await expect(api.postStockReceipt({ lines: [{ catalogItemId: PAPER, quantity: 1 }] })).resolves.toBeTruthy()
      await expect(api.postStockCount({ lines: [{ catalogItemId: PAPER, countedQuantity: 5 }] })).rejects.toMatchObject({
        status: 403,
      })
    } finally {
      await api.logout()
    }
  })

  it('filters levels by search and low-only, and paginates', async () => {
    expect((await api.getStockLevels({ search: 'boja' })).items.map((i) => i.catalogItemId)).toEqual([INK])
    const low = await api.getStockLevels({ lowOnly: true })
    expect(low.items.every((entry) => entry.low)).toBe(true)
    expect(low.items.map((i) => i.catalogItemId)).toContain(INK)
    const page = await api.getStockLevels({ limit: 2, offset: 0 })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBeGreaterThan(2)
  })

  it('validates catalog links and the unit rule on processes', async () => {
    const process = await api.getWorkOrderProcess(OPEN_ORDER)
    const withNode = (patch: Record<string, unknown>): ProcessGraph => {
      const graph: ProcessGraph = structuredClone(process!.graph)
      graph.nodes = graph.nodes.map((node) => (node.id === 'in-paper' ? { ...node, ...patch } : node))
      return graph
    }
    await expect(
      api.updateWorkOrderProcess(OPEN_ORDER, { graph: withNode({ catalogItemId: 'cat-1' }) }),
    ).rejects.toMatchObject({ status: 422, message: 'Artikal nije pronađen u katalogu.' })
    await expect(
      api.updateWorkOrderProcess(OPEN_ORDER, { graph: withNode({ catalogItemId: 'nope' }) }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(api.updateWorkOrderProcess(OPEN_ORDER, { graph: withNode({ unit: 'kg' }) })).rejects.toThrow(
      'Jedinica mora odgovarati jedinici artikla „Papir 80g A3“.',
    )
    // Case-insensitive match is fine; an empty unit is filled in.
    const saved = await api.updateWorkOrderProcess(OPEN_ORDER, { graph: withNode({ unit: ' TABAK ' }) })
    expect(saved.graph.nodes.find((n) => n.id === 'in-paper')?.unit).toBe(' TABAK ')
    const filled = await api.updateWorkOrderProcess(OPEN_ORDER, { graph: withNode({ unit: undefined }) })
    expect(filled.graph.nodes.find((n) => n.id === 'in-paper')?.unit).toBe('tabak')
  })

  it('computes catalog stock fields and refuses to delete an article with movements', async () => {
    const paper = await api.getCatalogItemById(PAPER)
    expect(paper).toMatchObject({ stockOnHand: 620, minStock: 200 })
    expect((await api.getCatalogItemById('cat-1'))).toMatchObject({ stockOnHand: null, minStock: null })
    await expect(api.deleteCatalogItem(PAPER)).rejects.toMatchObject({
      status: 409,
      message: 'Artikal ima promet u magacinu i ne može se obrisati.',
    })
    const updated = await api.updateCatalogItem(PAPER, { ...(paper as NonNullable<typeof paper>), minStock: 50 })
    expect(updated.minStock).toBe(50)
    expect((await level(PAPER)).minStock).toBe(50)
  })
})
