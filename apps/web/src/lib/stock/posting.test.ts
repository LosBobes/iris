import { describe, expect, it } from 'vitest'
import {
  consumedInputIds,
  desiredNet,
  isLowStock,
  materialRows,
  planCountPosting,
  planProcessPosting,
  reservedAcrossGraphs,
  reservedByArticle,
  shortageOf,
  shortages,
  stockContextFor,
  toLevelMap,
  type ExistingNet,
} from './posting'
import type { ProcessGraph } from '@/types/process'
import type { StockLevel } from '@/types/stock'

function level(id: string, onHand: number, reserved = 0, extra: Partial<StockLevel> = {}): StockLevel {
  return {
    catalogItemId: id,
    code: id.toUpperCase(),
    name: `Artikal ${id}`,
    unit: 'tabak',
    isActive: true,
    onHand,
    reserved,
    available: onHand - reserved,
    minStock: null,
    low: false,
    lastMovementAt: null,
    ...extra,
  }
}

// paper(100, a1) -> print -> cut -> pack -> out ; print -> waste(3, a2)
// plus an intermediate "sheets" product made by print and used by cut.
function graph(statuses: Partial<Record<'print' | 'cut', 'done' | 'pending' | 'skipped'>> = {}): ProcessGraph {
  return {
    nodes: [
      { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 0, quantity: 100, unit: 'tabak', catalogItemId: 'a1' },
      { id: 'print', kind: 'step', label: 'Štampa', x: 0, y: 0, status: statuses.print ?? 'pending' },
      { id: 'sheets', kind: 'product', label: 'Otisci', x: 0, y: 0, quantity: 90, unit: 'tabak', catalogItemId: 'a3' },
      { id: 'cut', kind: 'step', label: 'Sečenje', x: 0, y: 0, status: statuses.cut ?? 'pending' },
      { id: 'waste', kind: 'byproduct', label: 'Makulatura', x: 0, y: 0, quantity: 3, unit: 'tabak', catalogItemId: 'a2' },
      { id: 'free', kind: 'input', label: 'Slobodan', x: 0, y: 0, quantity: 5 },
    ],
    edges: [
      { id: 'e1', source: 'paper', target: 'print' },
      { id: 'e2', source: 'print', target: 'sheets' },
      { id: 'e3', source: 'sheets', target: 'cut' },
      { id: 'e4', source: 'print', target: 'waste' },
      { id: 'e5', source: 'free', target: 'print' },
    ],
  }
}

describe('desiredNet', () => {
  it('books an input as consumed once any step it feeds is done', () => {
    const paper = graph().nodes[0]
    expect(desiredNet(graph(), paper)).toBe(0)
    expect(desiredNet(graph({ print: 'done' }), paper)).toBe(-100)
    // skipped is not done
    expect(desiredNet(graph({ print: 'skipped' }), paper)).toBe(0)
  })

  it('books a byproduct when its producing step is done', () => {
    expect(desiredNet(graph({ print: 'done' }), graph().nodes[4])).toBe(3)
  })

  it('nets an intermediate product produced by one step and consumed by another to zero', () => {
    const sheets = graph().nodes[2]
    expect(desiredNet(graph({ print: 'done' }), sheets)).toBe(90)
    expect(desiredNet(graph({ print: 'done', cut: 'done' }), sheets)).toBe(0)
  })

  it('prefers the actual quantity and ignores zero quantities', () => {
    const done = graph({ print: 'done' })
    done.nodes[0] = { ...done.nodes[0], actualQuantity: 92 }
    expect(desiredNet(done, done.nodes[0])).toBe(-92)
    done.nodes[0] = { ...done.nodes[0], quantity: undefined, actualQuantity: undefined }
    expect(desiredNet(done, done.nodes[0])).toBe(0)
  })
})

describe('planProcessPosting', () => {
  it('posts consumption and production for the done step, skipping unlinked nodes', () => {
    const plan = planProcessPosting(graph({ print: 'done' }), [])
    expect(plan).toEqual([
      { processNodeId: 'paper', catalogItemId: 'a1', quantity: -100, kind: 'consumption' },
      { processNodeId: 'sheets', catalogItemId: 'a3', quantity: 90, kind: 'production' },
      { processNodeId: 'waste', catalogItemId: 'a2', quantity: 3, kind: 'production' },
    ])
  })

  it('is idempotent once the ledger matches', () => {
    const booked: ExistingNet[] = [
      { processNodeId: 'paper', catalogItemId: 'a1', quantity: -100 },
      { processNodeId: 'sheets', catalogItemId: 'a3', quantity: 90 },
      { processNodeId: 'waste', catalogItemId: 'a2', quantity: 3 },
    ]
    expect(planProcessPosting(graph({ print: 'done' }), booked)).toEqual([])
  })

  it('reverses a booking when the step is undone', () => {
    const plan = planProcessPosting(graph(), [{ processNodeId: 'paper', catalogItemId: 'a1', quantity: -100 }])
    expect(plan).toEqual([{ processNodeId: 'paper', catalogItemId: 'a1', quantity: 100, kind: 'adjustment' }])
  })

  it('posts only the delta when the actual quantity changes', () => {
    const done = graph({ print: 'done' })
    done.nodes[0] = { ...done.nodes[0], actualQuantity: 90 }
    const plan = planProcessPosting(done, [{ processNodeId: 'paper', catalogItemId: 'a1', quantity: -100 }])
    expect(plan.filter((p) => p.processNodeId === 'paper')).toEqual([
      { processNodeId: 'paper', catalogItemId: 'a1', quantity: 10, kind: 'adjustment' },
    ])
  })

  it('moves a booking to the new article when the link changes', () => {
    const done = graph({ print: 'done' })
    done.nodes[0] = { ...done.nodes[0], catalogItemId: 'a9' }
    const plan = planProcessPosting(done, [{ processNodeId: 'paper', catalogItemId: 'a1', quantity: -100 }])
    expect(plan.filter((p) => p.processNodeId === 'paper')).toEqual([
      { processNodeId: 'paper', catalogItemId: 'a1', quantity: 100, kind: 'adjustment' },
      { processNodeId: 'paper', catalogItemId: 'a9', quantity: -100, kind: 'consumption' },
    ])
  })

  it('reverses the booking of a node removed from the graph', () => {
    const plan = planProcessPosting(graph(), [{ processNodeId: 'gone', catalogItemId: 'a1', quantity: -50 }])
    expect(plan).toContainEqual({ processNodeId: 'gone', catalogItemId: 'a1', quantity: 50, kind: 'adjustment' })
  })
})

describe('reserved', () => {
  it('counts planned quantity of linked inputs not yet consumed', () => {
    expect(reservedByArticle(graph()).get('a1')).toBe(100)
    expect(reservedByArticle(graph()).has('a2')).toBe(false) // byproducts never reserve
    expect(reservedByArticle(graph({ print: 'done' })).has('a1')).toBe(false)
    expect(reservedByArticle(graph()).has('free')).toBe(false)
  })

  it('sums across graphs', () => {
    expect(reservedAcrossGraphs([graph(), graph(), graph({ print: 'done' })]).get('a1')).toBe(200)
  })

  it('lists consumed input nodes', () => {
    expect([...consumedInputIds(graph({ print: 'done' }))]).toEqual(['paper', 'free'])
  })
})

describe('planCountPosting', () => {
  it('uses opening for articles without movements and adjustment otherwise, skipping zero deltas', () => {
    const sources = new Map([
      ['new', { catalogItemId: 'new', onHand: 0, hasMovements: false }],
      ['old', { catalogItemId: 'old', onHand: 10, hasMovements: true }],
      ['same', { catalogItemId: 'same', onHand: 4, hasMovements: true }],
    ])
    expect(
      planCountPosting(
        [
          { catalogItemId: 'new', countedQuantity: 25 },
          { catalogItemId: 'old', countedQuantity: 7.5 },
          { catalogItemId: 'same', countedQuantity: 4 },
        ],
        sources,
      ),
    ).toEqual([
      { catalogItemId: 'new', quantity: 25, kind: 'opening' },
      { catalogItemId: 'old', quantity: -2.5, kind: 'adjustment' },
    ])
  })
})

describe('isLowStock', () => {
  it('flags available below minimum and any negative on-hand', () => {
    expect(isLowStock(10, 4, 5)).toBe(true)
    expect(isLowStock(10, 5, 5)).toBe(false)
    expect(isLowStock(10, 1, null)).toBe(false)
    expect(isLowStock(-1, -1, null)).toBe(true)
  })
})

describe('materialRows', () => {
  const levels = toLevelMap([level('a1', 620, 100), level('a2', 10)])

  it('adds the order own reservation back in order mode', () => {
    const [row] = materialRows(graph(), 'order', levels)
    expect(row).toMatchObject({ catalogItemId: 'a1', planned: 100, required: 100, onHand: 620, available: 620, shortage: 0 })
  })

  it('uses on-hand for templates and reports the shortage', () => {
    const short = toLevelMap([level('a1', 60, 0)])
    const [row] = materialRows(graph(), 'template', short)
    expect(row.shortage).toBe(40)
    expect(shortages([row])).toHaveLength(1)
  })

  it('compares actual to available and aggregates nodes of the same article', () => {
    const g = graph()
    g.nodes[0] = { ...g.nodes[0], actualQuantity: 130 }
    g.nodes.push({ id: 'paper2', kind: 'input', label: 'Papir 2', x: 0, y: 0, quantity: 20, catalogItemId: 'a1' })
    const [row] = materialRows(g, 'order', toLevelMap([level('a1', 150, 120)]))
    // available = 150 - 120 + (100 + 20) own reservation = 150; required = 130 + 20
    expect(row).toMatchObject({ planned: 120, actual: 130, required: 150, available: 150, shortage: 0 })
  })

  it('marks consumed articles and leaves unknown levels out', () => {
    const rows = materialRows(graph({ print: 'done' }), 'order', levels)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ consumed: true, required: 0, shortage: 0 })
    expect(materialRows(graph(), 'order', {})).toEqual([])
  })
})

describe('stockContextFor', () => {
  it('adds the own reservation in order mode and settles consumed inputs', () => {
    const levels = toLevelMap([level('a1', 620, 100)])
    const order = stockContextFor(graph({ print: 'done' }), 'order', levels)
    expect(order.items.a1.available).toBe(520)
    expect(order.settledNodeIds?.has('paper')).toBe(true)

    const pending = stockContextFor(graph(), 'order', levels)
    expect(pending.items.a1.available).toBe(520 + 100)
    expect(stockContextFor(graph(), 'template', levels).items.a1.available).toBe(620)
  })
})

describe('shortageOf', () => {
  it('reports nothing once the inputs are consumed, even with negative availability', () => {
    expect(shortageOf(0, -3500)).toBe(0)
  })

  it('never reports more than the order still needs', () => {
    expect(shortageOf(100, -3500)).toBe(100)
    expect(shortageOf(100, 40)).toBe(60)
    expect(shortageOf(100, 400)).toBe(0)
  })
})
