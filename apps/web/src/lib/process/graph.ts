import i18n from '@/i18n'
import type {
  ProcessEdge,
  ProcessGraph,
  ProcessNode,
  ProcessNodeKind,
  ProcessStepStatus,
} from '@/types/process'

// Client-side mirror of the graph rules the API enforces (see the process
// contract). The server stays authoritative; these guide the editor.

export const MAX_PROCESS_NODES = 200
export const MAX_PROCESS_EDGES = 400
export const MAX_ID_LENGTH = 64
export const MAX_LABEL_LENGTH = 120
export const MAX_UNIT_LENGTH = 20
export const MAX_NOTE_LENGTH = 500
export const MAX_EDGE_LABEL_LENGTH = 60

export const EMPTY_GRAPH: ProcessGraph = { nodes: [], edges: [] }

const ALLOWED_TARGETS: Record<ProcessNodeKind, ProcessNodeKind[]> = {
  input: ['step'],
  step: ['step', 'product', 'byproduct'],
  product: ['step'],
  byproduct: ['step'],
}

export function isItemKind(kind: ProcessNodeKind): boolean {
  return kind !== 'step'
}

/** Whether an edge from a node of kind `source` to one of kind `target` is allowed. */
export function isConnectionAllowed(source: ProcessNodeKind, target: ProcessNodeKind): boolean {
  return ALLOWED_TARGETS[source].includes(target)
}

function successors(edges: ProcessEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const edge of edges) {
    const list = map.get(edge.source)
    if (list) list.push(edge.target)
    else map.set(edge.source, [edge.target])
  }
  return map
}

/** True when `to` can already be reached from `from` by following edges. */
export function isReachable(edges: ProcessEdge[], from: string, to: string): boolean {
  const next = successors(edges)
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (current === to) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const target of next.get(current) ?? []) stack.push(target)
  }
  return false
}

/** Adding source→target would close a cycle (target already leads back to source). */
export function wouldCreateCycle(edges: ProcessEdge[], source: string, target: string): boolean {
  return source === target || isReachable(edges, target, source)
}

export type ConnectionProblem =
  | 'missingNode'
  | 'selfLoop'
  | 'kindNotAllowed'
  | 'duplicate'
  | 'cycle'
  | 'edgeLimit'

export function checkConnection(
  graph: ProcessGraph,
  source: string,
  target: string,
): ConnectionProblem | null {
  const from = graph.nodes.find((node) => node.id === source)
  const to = graph.nodes.find((node) => node.id === target)
  if (!from || !to) return 'missingNode'
  if (source === target) return 'selfLoop'
  if (!isConnectionAllowed(from.kind, to.kind)) return 'kindNotAllowed'
  if (graph.edges.some((edge) => edge.source === source && edge.target === target)) return 'duplicate'
  if (graph.edges.length >= MAX_PROCESS_EDGES) return 'edgeLimit'
  if (wouldCreateCycle(graph.edges, source, target)) return 'cycle'
  return null
}

export function canConnect(graph: ProcessGraph, source: string, target: string): boolean {
  return checkConnection(graph, source, target) === null
}

export function connectionProblemMessage(problem: ConnectionProblem): string {
  return i18n.t(`process.connection.${problem}`)
}

let idCounter = 0

/** Client-generated id (1..64 chars) that is unique within the given graph. */
export function generateId(prefix: string, taken: Iterable<string> = []): string {
  const used = new Set(taken)
  for (;;) {
    idCounter += 1
    const random = Math.random().toString(36).slice(2, 8)
    const id = `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${random}`.slice(0, MAX_ID_LENGTH)
    if (!used.has(id)) return id
  }
}

export function generateNodeId(graph: ProcessGraph, kind: ProcessNodeKind): string {
  return generateId(kind, graph.nodes.map((node) => node.id))
}

export function generateEdgeId(graph: ProcessGraph): string {
  return generateId('edge', graph.edges.map((edge) => edge.id))
}

/**
 * Full-graph validation. Returns Serbian messages (empty when the graph is
 * valid), in the order the server would report them.
 */
export function validateGraph(graph: ProcessGraph): string[] {
  const t = (key: string, options?: Record<string, unknown>): string => i18n.t(`process.validation.${key}`, options)
  const errors: string[] = []

  if (graph.nodes.length === 0 || !graph.nodes.some((node) => node.kind === 'step')) {
    errors.push(t('needsStep'))
  }
  if (graph.nodes.length > MAX_PROCESS_NODES) errors.push(t('tooManyNodes', { max: MAX_PROCESS_NODES }))
  if (graph.edges.length > MAX_PROCESS_EDGES) errors.push(t('tooManyEdges', { max: MAX_PROCESS_EDGES }))

  const byId = new Map<string, ProcessNode>()
  const seenIds = new Set<string>()
  for (const node of graph.nodes) {
    if (!node.id || node.id.length > MAX_ID_LENGTH) {
      errors.push(t('badNodeId'))
    } else if (seenIds.has(node.id)) {
      errors.push(t('duplicateNodeId', { id: node.id }))
    }
    seenIds.add(node.id)
    byId.set(node.id, node)

    const label = (node.label ?? '').trim()
    if (label === '') errors.push(t('labelRequired'))
    else if (label.length > MAX_LABEL_LENGTH) errors.push(t('labelTooLong', { label, max: MAX_LABEL_LENGTH }))

    if (isItemKind(node.kind)) {
      if (node.quantity !== undefined && (!Number.isFinite(node.quantity) || node.quantity < 0)) {
        errors.push(t('negativeQuantity', { label }))
      }
      if (node.actualQuantity !== undefined && (!Number.isFinite(node.actualQuantity) || node.actualQuantity < 0)) {
        errors.push(t('negativeQuantity', { label }))
      }
      if (node.unit !== undefined && node.unit.length > MAX_UNIT_LENGTH) {
        errors.push(t('unitTooLong', { label, max: MAX_UNIT_LENGTH }))
      }
    }
    if (node.note !== undefined && node.note.length > MAX_NOTE_LENGTH) {
      errors.push(t('noteTooLong', { label, max: MAX_NOTE_LENGTH }))
    }
  }

  const seenEdgeIds = new Set<string>()
  const seenPairs = new Set<string>()
  for (const edge of graph.edges) {
    if (seenEdgeIds.has(edge.id)) errors.push(t('duplicateEdgeId'))
    seenEdgeIds.add(edge.id)

    const from = byId.get(edge.source)
    const to = byId.get(edge.target)
    if (!from || !to) {
      errors.push(t('danglingEdge'))
      continue
    }
    if (edge.source === edge.target) {
      errors.push(t('selfLoop', { label: from.label }))
      continue
    }
    const pair = `${edge.source}\u0000${edge.target}`
    if (seenPairs.has(pair)) errors.push(t('duplicateEdge', { from: from.label, to: to.label }))
    seenPairs.add(pair)
    if (!isConnectionAllowed(from.kind, to.kind)) {
      errors.push(t('connectionNotAllowed', { from: from.label, to: to.label }))
    }
    if (edge.label !== undefined && edge.label.length > MAX_EDGE_LABEL_LENGTH) {
      errors.push(t('edgeLabelTooLong', { max: MAX_EDGE_LABEL_LENGTH }))
    }
  }

  if (hasCycle(graph)) errors.push(t('cycle'))

  return Array.from(new Set(errors))
}

/** Kahn's algorithm: true when the graph contains a directed cycle. */
export function hasCycle(graph: ProcessGraph): boolean {
  const ids = new Set(graph.nodes.map((node) => node.id))
  const indegree = new Map<string, number>()
  for (const id of ids) indegree.set(id, 0)
  const next = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    const list = next.get(edge.source)
    if (list) list.push(edge.target)
    else next.set(edge.source, [edge.target])
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id)
  let visited = 0
  while (queue.length > 0) {
    const id = queue.pop() as string
    visited += 1
    for (const target of next.get(id) ?? []) {
      const degree = (indegree.get(target) ?? 0) - 1
      indegree.set(target, degree)
      if (degree === 0) queue.push(target)
    }
  }
  return visited !== ids.size
}

export interface StepProgress {
  total: number
  done: number
  skipped: number
  inProgress: number
  /** done + skipped */
  finished: number
  /** 0..100 */
  percent: number
}

export function stepStatus(node: ProcessNode): ProcessStepStatus {
  return node.status ?? 'pending'
}

export function summarizeProgress(graph: ProcessGraph): StepProgress {
  const steps = graph.nodes.filter((node) => node.kind === 'step')
  let done = 0
  let skipped = 0
  let inProgress = 0
  for (const step of steps) {
    const status = stepStatus(step)
    if (status === 'done') done += 1
    else if (status === 'skipped') skipped += 1
    else if (status === 'in_progress') inProgress += 1
  }
  const finished = done + skipped
  return {
    total: steps.length,
    done,
    skipped,
    inProgress,
    finished,
    percent: steps.length === 0 ? 0 : Math.round((finished / steps.length) * 100),
  }
}

/** Every step that leads (through any path) to the given node. */
export function predecessorSteps(graph: ProcessGraph, nodeId: string): ProcessNode[] {
  const incoming = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const list = incoming.get(edge.target)
    if (list) list.push(edge.source)
    else incoming.set(edge.target, [edge.source])
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>([nodeId])
  const stack = [...(incoming.get(nodeId) ?? [])]
  const steps: ProcessNode[] = []
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node?.kind === 'step') steps.push(node)
    for (const source of incoming.get(id) ?? []) stack.push(source)
  }
  return steps
}

/** A step is ready when every step upstream of it (any path) is done or skipped. */
export function isStepReady(graph: ProcessGraph, stepId: string): boolean {
  return predecessorSteps(graph, stepId).every((step) => {
    const status = stepStatus(step)
    return status === 'done' || status === 'skipped'
  })
}

/** Open steps (pending / in progress) whose upstream steps are all finished. */
export function readySteps(graph: ProcessGraph): ProcessNode[] {
  return graph.nodes.filter((node) => {
    if (node.kind !== 'step') return false
    const status = stepStatus(node)
    if (status === 'done' || status === 'skipped') return false
    return isStepReady(graph, node.id)
  })
}

function sameNumber(a: number | undefined | null, b: number | undefined | null): boolean {
  return (a ?? null) === (b ?? null)
}

function sameText(a: string | undefined | null, b: string | undefined | null): boolean {
  return (a ?? '') === (b ?? '')
}

/**
 * True when `next` differs from `prev` in anything an operator may not change:
 * the node set, kind, label, quantity, unit, catalogItemId, or the edge set
 * (including labels). Status, actual quantity, note and position are free.
 */
export function hasStructuralChange(prev: ProcessGraph, next: ProcessGraph): boolean {
  if (prev.nodes.length !== next.nodes.length || prev.edges.length !== next.edges.length) return true

  const before = new Map(prev.nodes.map((node) => [node.id, node]))
  for (const node of next.nodes) {
    const old = before.get(node.id)
    if (!old) return true
    if (
      old.kind !== node.kind ||
      !sameText(old.label, node.label) ||
      !sameNumber(old.quantity, node.quantity) ||
      !sameText(old.unit, node.unit) ||
      !sameText(old.catalogItemId, node.catalogItemId)
    ) {
      return true
    }
  }

  const edgesBefore = new Map(prev.edges.map((edge) => [edge.id, edge]))
  for (const edge of next.edges) {
    const old = edgesBefore.get(edge.id)
    if (!old) return true
    if (old.source !== edge.source || old.target !== edge.target || !sameText(old.label, edge.label)) {
      return true
    }
  }
  return false
}

/** Any change at all (used for dirty tracking). */
export function graphsEqual(a: ProcessGraph, b: ProcessGraph): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function cloneGraph(graph: ProcessGraph): ProcessGraph {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  }
}

/** Template → order copy: same structure, all steps pending, no actual quantities. */
export function copyTemplateToOrder(graph: ProcessGraph): ProcessGraph {
  const copy = cloneGraph(graph)
  copy.nodes = copy.nodes.map((node) => {
    const next: ProcessNode = { ...node }
    delete next.actualQuantity
    if (node.kind === 'step') next.status = 'pending'
    else delete next.status
    return next
  })
  return copy
}

/** Removes per-order state; what a template stores. */
export function stripOrderState(graph: ProcessGraph): ProcessGraph {
  const copy = cloneGraph(graph)
  copy.nodes = copy.nodes.map((node) => {
    const next: ProcessNode = { ...node }
    delete next.status
    delete next.actualQuantity
    return next
  })
  return copy
}

/** Drops fields that do not apply to the node's kind, as the server does. */
export function normalizeGraphForKinds(graph: ProcessGraph): ProcessGraph {
  const copy = cloneGraph(graph)
  copy.nodes = copy.nodes.map((node) => {
    const next: ProcessNode = { ...node, label: node.label.trim() }
    if (node.kind === 'step') {
      delete next.quantity
      delete next.unit
      delete next.catalogItemId
      delete next.actualQuantity
    } else {
      delete next.status
    }
    return next
  })
  return copy
}

/**
 * Which handles an edge is drawn between. The main flow (step → step,
 * step → product, product/byproduct → later step) runs left to right; an input
 * drops into the top of its step and a byproduct hangs off the bottom, so side
 * streams read as vertical lines. Edges store no handles; this is display only.
 */
export function edgeHandles(
  sourceKind: ProcessNodeKind | undefined,
  targetKind: ProcessNodeKind | undefined,
): { sourceHandle: string; targetHandle: string } {
  if (sourceKind === 'input' && targetKind === 'step') return { sourceHandle: 'bottom', targetHandle: 'top' }
  if (sourceKind === 'step' && targetKind === 'byproduct') return { sourceHandle: 'bottom', targetHandle: 'top' }
  return { sourceHandle: 'out', targetHandle: 'in' }
}
