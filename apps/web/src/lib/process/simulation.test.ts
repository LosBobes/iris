import { describe, expect, it } from 'vitest'
import '@/i18n'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import {
  analyzeProcess,
  computeYield,
  formatSimQuantity,
  maxPosition,
  nodeStatesAt,
  planSimulation,
  simulationGraph,
  stockRequirements,
  waveAt,
} from './simulation'

function n(id: string, kind: ProcessNode['kind'], extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, kind, label: id, x: 0, y: 0, ...extra }
}
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target })

// paper(10 kg) -> print -> proof(2 kg product, consumed by cut)
// ink(3 kg)  -> print
// glue(1 l)  -> bind ; print -> bind ; cut -> (box 8 kg product, offcut 2 kg byproduct)
// Two parallel branches: print and fold both start at wave 1.
const graph: ProcessGraph = {
  nodes: [
    n('paper', 'input', { quantity: 10, unit: 'kg' }),
    n('ink', 'input', { quantity: 3, unit: 'kg' }),
    n('sheets', 'input', { quantity: 5, unit: 'kg' }),
    n('print', 'step'),
    n('fold', 'step'),
    n('proof', 'product', { quantity: 2, unit: 'kg' }),
    n('cut', 'step'),
    n('box', 'product', { quantity: 8, unit: 'kg' }),
    n('offcut', 'byproduct', { quantity: 2, unit: 'kg' }),
  ],
  edges: [
    e('paper', 'print'),
    e('ink', 'print'),
    e('sheets', 'fold'),
    e('print', 'proof'),
    e('proof', 'cut'),
    e('fold', 'cut'),
    e('cut', 'box'),
    e('cut', 'offcut'),
  ],
}

describe('analyzeProcess', () => {
  it('reports no issues for a sound process', () => {
    const issues = analyzeProcess(graph)
    // fold has no "unproduced" or dead-end problem; everything is wired.
    expect(issues).toEqual([])
  })

  it('reuses validateGraph for hard errors', () => {
    const issues = analyzeProcess({ nodes: [], edges: [] })
    expect(issues.some((i) => i.severity === 'error' && i.code === 'invalid')).toBe(true)
  })

  it('warns about a step nothing feeds and a step that leads nowhere', () => {
    const issues = analyzeProcess({ nodes: [n('s', 'step')], edges: [] })
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('stepNoInput')
    expect(codes).toContain('stepDeadEnd')
    expect(codes).toContain('noProduct')
    expect(issues.find((i) => i.code === 'stepNoInput')?.nodeIds).toEqual(['s'])
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
  })

  it('flags isolated items once and unused inputs separately', () => {
    const issues = analyzeProcess({
      nodes: [n('s', 'step'), n('lonely', 'input'), n('spare', 'input'), n('out', 'product')],
      edges: [e('spare', 's'), e('s', 'out')],
    })
    expect(issues.find((i) => i.code === 'itemIsolated')?.nodeIds).toEqual(['lonely'])
    expect(issues.some((i) => i.code === 'inputUnused')).toBe(false)
  })

  it('flags an input that has edges but no consumer', () => {
    const issues = analyzeProcess({
      nodes: [n('a', 'step'), n('b', 'step'), n('in', 'input'), n('out', 'product')],
      edges: [e('a', 'b'), e('b', 'out'), e('a', 'in')],
    })
    // an edge into an input is invalid, but the warning logic must not crash
    expect(issues.some((i) => i.code === 'invalid')).toBe(true)
    expect(issues.some((i) => i.code === 'inputUnused')).toBe(true)
  })

  it('warns when a consumed product is never produced', () => {
    const issues = analyzeProcess({
      nodes: [n('s', 'step'), n('p', 'product'), n('out', 'product')],
      edges: [e('p', 's'), e('s', 'out')],
    })
    expect(issues.find((i) => i.code === 'itemUnproduced')?.nodeIds).toEqual(['p'])
  })

  it('does not flag terminal products or byproducts', () => {
    const issues = analyzeProcess({
      nodes: [n('i', 'input'), n('s', 'step'), n('p', 'product'), n('b', 'byproduct')],
      edges: [e('i', 's'), e('s', 'p'), e('s', 'b')],
    })
    expect(issues).toEqual([])
  })

  it('flags steps only reachable through a cycle as unreachable', () => {
    const issues = analyzeProcess({
      nodes: [n('a', 'step'), n('b', 'step')],
      edges: [e('a', 'b'), e('b', 'a')],
    })
    expect(issues.some((i) => i.code === 'invalid')).toBe(true)
    expect(issues.filter((i) => i.code === 'stepUnreachable').map((i) => i.nodeIds[0]).sort()).toEqual(['a', 'b'])
  })

  it('ignores dangling edges instead of throwing', () => {
    expect(() => analyzeProcess({ nodes: [n('s', 'step')], edges: [e('s', 'ghost')] })).not.toThrow()
  })
})

describe('planSimulation', () => {
  it('groups parallel branches into the same wave', () => {
    const plan = planSimulation(graph)
    expect(plan.ticks).toHaveLength(2)
    expect(plan.ticks[0].steps.map((s) => s.id).sort()).toEqual(['fold', 'print'])
    expect(plan.ticks[1].steps.map((s) => s.id)).toEqual(['cut'])
    expect(plan.stepTick).toEqual({ print: 1, fold: 1, cut: 2 })
  })

  it('lists consumed inputs and produced items per wave', () => {
    const plan = planSimulation(graph)
    expect(plan.ticks[0].consumed.map((i) => i.nodeId).sort()).toEqual(['ink', 'paper', 'sheets'])
    expect(plan.ticks[0].products.map((i) => i.nodeId)).toEqual(['proof'])
    expect(plan.ticks[1].consumed.map((i) => i.nodeId)).toEqual(['proof'])
    expect(plan.ticks[1].products.map((i) => i.nodeId)).toEqual(['box'])
    expect(plan.ticks[1].byproducts.map((i) => i.nodeId)).toEqual(['offcut'])
  })

  it('scales quantities and keeps unknown ones undefined', () => {
    const open = { ...graph, nodes: [...graph.nodes, n('free', 'input')], edges: [...graph.edges, e('free', 'fold')] }
    const plan = planSimulation(open, { quantity: 3 })
    const paper = plan.ticks[0].consumed.find((i) => i.nodeId === 'paper')
    expect(paper?.quantity).toBe(30)
    expect(plan.ticks[0].consumed.find((i) => i.nodeId === 'free')?.quantity).toBeUndefined()
    expect(plan.totals.inputs).toEqual([
      { unit: 'kg', quantity: 54, unknown: 0 },
      { unit: '', quantity: 0, unknown: 1 },
    ])
  })

  it('defaults a bad multiplier to 1 and clamps negatives to 0', () => {
    expect(planSimulation(graph, { quantity: Number.NaN }).quantity).toBe(1)
    expect(planSimulation(graph, { quantity: -4 }).quantity).toBe(0)
  })

  it('totals only final outputs and computes yield', () => {
    const plan = planSimulation(graph)
    expect(plan.totals.inputs).toEqual([{ unit: 'kg', quantity: 18, unknown: 0 }])
    expect(plan.totals.products).toEqual([{ unit: 'kg', quantity: 8, unknown: 0 }])
    expect(plan.totals.byproducts).toEqual([{ unit: 'kg', quantity: 2, unknown: 0 }])
    expect(plan.yieldPercent).toBe(80)
  })

  it('omits yield when units differ or quantities are missing', () => {
    const mixed = planSimulation({
      nodes: [n('s', 'step'), n('p', 'product', { quantity: 5, unit: 'kom' }), n('b', 'byproduct', { quantity: 1, unit: 'kg' })],
      edges: [e('s', 'p'), e('s', 'b')],
    })
    expect(mixed.yieldPercent).toBeNull()
    const missing = planSimulation({
      nodes: [n('s', 'step'), n('p', 'product', { unit: 'kg' })],
      edges: [e('s', 'p')],
    })
    expect(missing.yieldPercent).toBeNull()
    expect(missing.totals.products).toEqual([{ unit: 'kg', quantity: 0, unknown: 1 }])
  })

  it('yields 100% with no byproducts when product units are consistent', () => {
    const plan = planSimulation({
      nodes: [n('s', 'step'), n('p', 'product', { quantity: 5, unit: 'kg' })],
      edges: [e('s', 'p')],
    })
    expect(plan.yieldPercent).toBe(100)
  })

  it('does not produce outputs that only skipped steps make, nor consume them', () => {
    const plan = planSimulation(graph, { skipped: new Set(['print']) })
    expect(plan.ticks[0].steps.find((s) => s.id === 'print')?.skipped).toBe(true)
    expect(plan.ticks[0].products).toEqual([])
    expect(plan.unavailable).toEqual(['proof'])
    expect(plan.ticks[0].consumed.map((i) => i.nodeId)).toEqual(['sheets'])
    expect(plan.ticks[1].consumed).toEqual([])
    expect(plan.consumedAt.paper).toBeUndefined()
  })

  it('keeps an output that another, running step also produces', () => {
    const shared: ProcessGraph = {
      nodes: [n('a', 'step'), n('b', 'step'), n('p', 'product', { quantity: 1, unit: 'kg' })],
      edges: [e('a', 'p'), e('b', 'p')],
    }
    const plan = planSimulation(shared, { skipped: new Set(['a']) })
    expect(plan.ticks[0].products.map((i) => i.nodeId)).toEqual(['p'])
    expect(plan.unavailable).toEqual([])
  })

  it('returns an empty plan for cyclic graphs', () => {
    const plan = planSimulation({ nodes: [n('a', 'step'), n('b', 'step')], edges: [e('a', 'b'), e('b', 'a')] })
    expect(plan.cyclic).toBe(true)
    expect(plan.ticks).toEqual([])
  })

  it('does not mutate its input', () => {
    const copy = JSON.stringify(graph)
    planSimulation(graph, { quantity: 2, skipped: new Set(['print']) })
    expect(JSON.stringify(graph)).toBe(copy)
  })

  it('counts a chain of steps as successive waves', () => {
    const plan = planSimulation({
      nodes: [n('a', 'step'), n('b', 'step'), n('c', 'step')],
      edges: [e('a', 'b'), e('b', 'c')],
    })
    expect(plan.ticks.map((t) => t.steps.map((s) => s.id))).toEqual([['a'], ['b'], ['c']])
  })
})

describe('computeYield', () => {
  it('needs a shared non-empty unit', () => {
    expect(computeYield([{ nodeId: 'p', label: 'p', quantity: 1 }], [])).toBeNull()
    expect(computeYield([], [])).toBeNull()
  })
})

describe('formatSimQuantity', () => {
  it('formats known and unknown quantities', () => {
    expect(formatSimQuantity(undefined, 'kg')).toBe('—')
    expect(formatSimQuantity(3, 'kg')).toBe('3 kg')
    expect(formatSimQuantity(4)).toBe('4')
  })
})

describe('playback helpers', () => {
  const plan = planSimulation(graph)

  it('maps positions to waves', () => {
    expect(maxPosition(plan)).toBe(4)
    expect([0, 1, 2, 3, 4].map(waveAt)).toEqual([0, 1, 1, 2, 2])
  })

  it('derives node states across the run', () => {
    expect(nodeStatesAt(graph, plan, 0).get('print')).toBe('idle')
    const running = nodeStatesAt(graph, plan, 1)
    expect(running.get('print')).toBe('running')
    expect(running.get('paper')).toBe('consumed')
    expect(running.get('proof')).toBe('idle')
    const done = nodeStatesAt(graph, plan, 2)
    expect(done.get('print')).toBe('done')
    expect(done.get('proof')).toBe('produced')
    const next = nodeStatesAt(graph, plan, 3)
    expect(next.get('cut')).toBe('running')
    expect(next.get('proof')).toBe('consumed')
    const end = nodeStatesAt(graph, plan, 4)
    expect(end.get('box')).toBe('produced')
    expect(end.get('offcut')).toBe('produced')
  })

  it('marks skipped steps and unavailable items', () => {
    const skipPlan = planSimulation(graph, { skipped: new Set(['print']) })
    const states = nodeStatesAt(graph, skipPlan, 1)
    expect(states.get('print')).toBe('skipped')
    expect(states.get('proof')).toBe('unavailable')
  })

  it('builds a display graph without touching the original', () => {
    const copy = JSON.stringify(graph)
    const view = simulationGraph(graph, nodeStatesAt(graph, plan, 1), 2)
    expect(view.nodes.find((x) => x.id === 'print')?.status).toBe('in_progress')
    expect(view.nodes.find((x) => x.id === 'paper')?.quantity).toBe(20)
    expect(JSON.stringify(graph)).toBe(copy)
  })
})

describe('stock-aware tester', () => {
  const linked: ProcessGraph = {
    nodes: [
      n('paper', 'input', { quantity: 10, unit: 'tabak', catalogItemId: 'a1' }),
      n('ink', 'input', { quantity: 2, unit: 'kg' }),
      n('print', 'step'),
      n('out', 'product', { quantity: 9, unit: 'tabak' }),
    ],
    edges: [e('paper', 'print'), e('ink', 'print'), e('print', 'out')],
  }
  const stock = (available: number, extra: { settledNodeIds?: Set<string> } = {}) => ({
    items: { a1: { name: 'Papir 80g', unit: 'tabak', onHand: available, available } },
    ...extra,
  })

  it('does not run stock checks without a stock snapshot', () => {
    expect(analyzeProcess(linked).map((i) => i.code)).not.toContain('inputUnlinked')
  })

  it('warns about unlinked inputs when stock is tracked', () => {
    const issues = analyzeProcess(linked, { stock: stock(100) })
    const warning = issues.find((i) => i.code === 'inputUnlinked')
    expect(warning).toMatchObject({ severity: 'warning', nodeIds: ['ink'] })
    expect(warning?.message).toBe('Ulaz „ink“ nije povezan sa artiklom iz kataloga — stanje se ne prati.')
    expect(issues.find((i) => i.code === 'insufficientStock')).toBeUndefined()
  })

  it('reports an error when the simulated quantity exceeds the available stock', () => {
    const issues = analyzeProcess(linked, { stock: stock(25), quantity: 3 })
    const error = issues.find((i) => i.code === 'insufficientStock')
    expect(error).toMatchObject({ severity: 'error', nodeIds: ['paper'] })
    expect(error?.message).toBe('Nedovoljno materijala „Papir 80g“: potrebno 30 tabak, raspoloživo 25 tabak.')
    // Exactly enough is fine.
    expect(analyzeProcess(linked, { stock: stock(30), quantity: 3 }).some((i) => i.code === 'insufficientStock')).toBe(false)
  })

  it('ignores skipped steps and already settled inputs', () => {
    expect(
      analyzeProcess(linked, { stock: stock(1), skipped: new Set(['print']) }).some((i) => i.code === 'insufficientStock'),
    ).toBe(false)
    expect(
      analyzeProcess(linked, { stock: stock(1, { settledNodeIds: new Set(['paper']) }) }).some(
        (i) => i.code === 'insufficientStock',
      ),
    ).toBe(false)
  })

  it('computes requirements per article with the scaled quantity', () => {
    const plan = planSimulation(linked, { quantity: 2 })
    expect(stockRequirements(linked, plan, stock(15))).toEqual([
      { catalogItemId: 'a1', name: 'Papir 80g', unit: 'tabak', nodeIds: ['paper'], required: 20, onHand: 15, available: 15, shortage: 5 },
    ])
  })
})
