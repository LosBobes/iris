import { describe, expect, it } from 'vitest'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import {
  canConnect,
  edgeHandles,
  checkConnection,
  copyTemplateToOrder,
  generateId,
  hasCycle,
  hasStructuralChange,
  isConnectionAllowed,
  isStepReady,
  readySteps,
  stripOrderState,
  summarizeProgress,
  validateGraph,
  wouldCreateCycle,
} from './graph'

function n(id: string, kind: ProcessNode['kind'], extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, kind, label: id.toUpperCase(), x: 0, y: 0, ...extra }
}
const e = (source: string, target: string, label?: string) => ({
  id: `${source}-${target}`,
  source,
  target,
  ...(label ? { label } : {}),
})

// in1 -> s1 -> s2 -> s3, s1 -> by1, s3 -> p1
function sample(): ProcessGraph {
  return {
    nodes: [
      n('in1', 'input', { quantity: 5, unit: 'kg' }),
      n('s1', 'step', { status: 'pending' }),
      n('s2', 'step', { status: 'pending' }),
      n('s3', 'step', { status: 'pending' }),
      n('by1', 'byproduct'),
      n('p1', 'product'),
    ],
    edges: [e('in1', 's1'), e('s1', 's2'), e('s2', 's3'), e('s1', 'by1'), e('s3', 'p1')],
  }
}

describe('connection rules', () => {
  it('allows exactly the contract kinds', () => {
    expect(isConnectionAllowed('input', 'step')).toBe(true)
    expect(isConnectionAllowed('step', 'step')).toBe(true)
    expect(isConnectionAllowed('step', 'product')).toBe(true)
    expect(isConnectionAllowed('step', 'byproduct')).toBe(true)
    expect(isConnectionAllowed('product', 'step')).toBe(true)
    expect(isConnectionAllowed('byproduct', 'step')).toBe(true)

    expect(isConnectionAllowed('step', 'input')).toBe(false)
    expect(isConnectionAllowed('input', 'input')).toBe(false)
    expect(isConnectionAllowed('input', 'product')).toBe(false)
    expect(isConnectionAllowed('product', 'byproduct')).toBe(false)
    expect(isConnectionAllowed('product', 'input')).toBe(false)
  })

  it('reports why a connection is refused', () => {
    const graph = sample()
    expect(checkConnection(graph, 's1', 's1')).toBe('selfLoop')
    expect(checkConnection(graph, 's1', 's2')).toBe('duplicate')
    expect(checkConnection(graph, 's3', 's1')).toBe('cycle')
    expect(checkConnection(graph, 'p1', 'in1')).toBe('kindNotAllowed')
    expect(checkConnection(graph, 'nope', 's1')).toBe('missingNode')
    expect(canConnect(graph, 'in1', 's3')).toBe(true)
  })

  it('detects cycles through products that feed later steps', () => {
    const graph = sample()
    expect(wouldCreateCycle(graph.edges, 's3', 's1')).toBe(true)
    expect(wouldCreateCycle(graph.edges, 's1', 's3')).toBe(false)
    // p1 -> s1 would loop: s1 -> s2 -> s3 -> p1 -> s1
    expect(canConnect(graph, 'p1', 's1')).toBe(false)
    expect(hasCycle({ ...graph, edges: [...graph.edges, e('p1', 's1')] })).toBe(true)
    expect(hasCycle(graph)).toBe(false)
  })
})

describe('validateGraph', () => {
  it('accepts a good graph', () => {
    expect(validateGraph(sample())).toEqual([])
  })

  it('needs at least one step', () => {
    expect(validateGraph({ nodes: [], edges: [] })).toEqual(['Proces mora imati bar jedan korak.'])
    expect(validateGraph({ nodes: [n('in1', 'input')], edges: [] })).toContain(
      'Proces mora imati bar jedan korak.',
    )
  })

  it('flags empty labels, negative quantities and long text', () => {
    const graph = sample()
    graph.nodes[0] = { ...graph.nodes[0], label: '   ', quantity: -1 }
    const errors = validateGraph(graph)
    expect(errors).toContain('Svaki čvor mora imati naziv.')
    expect(errors.some((message) => message.includes('negativna'))).toBe(true)
  })

  it('flags duplicate ids, dangling and duplicate edges, and forbidden kinds', () => {
    const graph = sample()
    graph.nodes.push(n('s1', 'step'))
    graph.edges.push(e('s1', 's2'), { id: 'x', source: 'ghost', target: 's1' }, e('p1', 'by1'))
    const errors = validateGraph(graph)
    expect(errors.some((message) => message.includes('se ponavlja'))).toBe(true)
    expect(errors).toContain('Veza pokazuje na čvor koji ne postoji.')
    expect(errors.some((message) => message.includes('nije dozvoljena'))).toBe(true)
  })

  it('flags cycles', () => {
    const graph = sample()
    graph.edges.push(e('s3', 's1'))
    expect(validateGraph(graph)).toContain('Proces ne sme sadržati krug.')
  })

  it('flags self loops', () => {
    const graph = sample()
    graph.edges.push(e('s2', 's2'))
    expect(validateGraph(graph).some((message) => message.includes('sam sa sobom'))).toBe(true)
  })
})

describe('progress and readiness', () => {
  it('summarizes done and skipped steps against the total', () => {
    const graph = sample()
    graph.nodes = graph.nodes.map((node) =>
      node.id === 's1' ? { ...node, status: 'done' } : node.id === 's2' ? { ...node, status: 'skipped' } : node,
    )
    expect(summarizeProgress(graph)).toMatchObject({ total: 3, done: 1, skipped: 1, finished: 2, percent: 67 })
    expect(summarizeProgress({ nodes: [], edges: [] }).percent).toBe(0)
  })

  it('treats a step as ready when every upstream step is done or skipped', () => {
    const graph = sample()
    expect(readySteps(graph).map((node) => node.id)).toEqual(['s1'])
    expect(isStepReady(graph, 's3')).toBe(false)

    graph.nodes = graph.nodes.map((node) => (node.id === 's1' ? { ...node, status: 'skipped' } : node))
    expect(readySteps(graph).map((node) => node.id)).toEqual(['s2'])

    // Any path counts: s3 also waits for s1 transitively.
    graph.nodes = graph.nodes.map((node) => (node.id === 's2' ? { ...node, status: 'done' } : node))
    expect(readySteps(graph).map((node) => node.id)).toEqual(['s3'])
  })

  it('looks through products that feed a step', () => {
    const graph: ProcessGraph = {
      nodes: [n('a', 'step'), n('p', 'product'), n('b', 'step', { status: 'pending' })],
      edges: [e('a', 'p'), e('p', 'b')],
    }
    expect(isStepReady(graph, 'b')).toBe(false)
  })
})

describe('hasStructuralChange', () => {
  it('ignores state, notes and positions', () => {
    const before = sample()
    const after: ProcessGraph = {
      ...before,
      nodes: before.nodes.map((node) => ({
        ...node,
        x: node.x + 40,
        y: node.y + 10,
        note: 'napomena',
        ...(node.kind === 'step' ? { status: 'done' as const } : { actualQuantity: 3 }),
      })),
    }
    expect(hasStructuralChange(before, after)).toBe(false)
  })

  it('detects node set, kind, label, quantity, unit and catalog changes', () => {
    const before = sample()
    const change = (patch: Partial<ProcessNode>): boolean =>
      hasStructuralChange(before, {
        ...before,
        nodes: before.nodes.map((node) => (node.id === 'in1' ? { ...node, ...patch } : node)),
      })
    expect(change({ label: 'Drugi' })).toBe(true)
    expect(change({ quantity: 6 })).toBe(true)
    expect(change({ unit: 'g' })).toBe(true)
    expect(change({ catalogItemId: 'cat-1' })).toBe(true)
    expect(change({ kind: 'byproduct' })).toBe(true)
    expect(hasStructuralChange(before, { ...before, nodes: before.nodes.slice(1) })).toBe(true)
    expect(hasStructuralChange(before, { ...before, nodes: [...before.nodes, n('x', 'step')] })).toBe(true)
  })

  it('detects edge set and label changes', () => {
    const before = sample()
    expect(hasStructuralChange(before, { ...before, edges: before.edges.slice(1) })).toBe(true)
    expect(
      hasStructuralChange(before, {
        ...before,
        edges: before.edges.map((edge, i) => (i === 0 ? { ...edge, label: 'x' } : edge)),
      }),
    ).toBe(true)
    expect(
      hasStructuralChange(before, {
        ...before,
        edges: before.edges.map((edge, i) => (i === 0 ? { ...edge, target: 's3' } : edge)),
      }),
    ).toBe(true)
  })
})

describe('copies and ids', () => {
  it('copies a template to an order with pending steps and no actuals', () => {
    const template: ProcessGraph = {
      nodes: [n('s', 'step', { status: 'done' }), n('i', 'input', { quantity: 1, actualQuantity: 9 })],
      edges: [e('i', 's')],
    }
    const copy = copyTemplateToOrder(template)
    expect(copy.nodes[0].status).toBe('pending')
    expect(copy.nodes[1].actualQuantity).toBeUndefined()
    expect(copy.nodes[1].quantity).toBe(1)
    copy.nodes[0].label = 'changed'
    expect(template.nodes[0].label).toBe('S')
  })

  it('strips per-order state for templates', () => {
    const graph = stripOrderState({
      nodes: [n('s', 'step', { status: 'done' }), n('i', 'input', { actualQuantity: 2 })],
      edges: [],
    })
    expect(graph.nodes.some((node) => node.status || node.actualQuantity !== undefined)).toBe(false)
  })

  it('generates unique ids of at most 64 characters', () => {
    const taken = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const id = generateId('byproduct', taken)
      expect(id.length).toBeGreaterThan(0)
      expect(id.length).toBeLessThanOrEqual(64)
      expect(taken.has(id)).toBe(false)
      taken.add(id)
    }
  })
})

describe('edgeHandles', () => {
  it('draws inputs and byproducts as vertical side streams', () => {
    expect(edgeHandles('input', 'step')).toEqual({ sourceHandle: 'bottom', targetHandle: 'top' })
    expect(edgeHandles('step', 'byproduct')).toEqual({ sourceHandle: 'bottom', targetHandle: 'top' })
  })

  it('keeps the main flow left to right', () => {
    expect(edgeHandles('step', 'step')).toEqual({ sourceHandle: 'out', targetHandle: 'in' })
    expect(edgeHandles('step', 'product')).toEqual({ sourceHandle: 'out', targetHandle: 'in' })
    expect(edgeHandles('product', 'step')).toEqual({ sourceHandle: 'out', targetHandle: 'in' })
    expect(edgeHandles('byproduct', 'step')).toEqual({ sourceHandle: 'out', targetHandle: 'in' })
  })
})
