import type { ProcessGraph, ProcessNode } from '@/types/process'
import type { StockLevel } from '@/types/stock'

// Pure stock-posting math shared by the fixture ledger and the UI previews. It
// mirrors the automatic-posting algorithm of the Magacin contract: for every
// linked item node compute the DESIRED net movement from step statuses, then
// post only the difference to what is already booked. Nothing here touches the
// API or mutates its inputs.

/** Quantities closer to zero than this are treated as zero. */
export const STOCK_EPSILON = 1e-9

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000
}

function isItem(node: ProcessNode): boolean {
  return node.kind !== 'step'
}

function stepsDone(graph: ProcessGraph, nodeIds: string[]): boolean {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  return nodeIds.some((id) => {
    const node = byId.get(id)
    return node?.kind === 'step' && node.status === 'done'
  })
}

/** True once any step this item feeds (outgoing edge) is done. `skipped` is not done. */
export function isConsumed(graph: ProcessGraph, nodeId: string): boolean {
  return stepsDone(
    graph,
    graph.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target),
  )
}

/** True once the step that produces this item (incoming edge source) is done. */
export function isProduced(graph: ProcessGraph, nodeId: string): boolean {
  return stepsDone(
    graph,
    graph.edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source),
  )
}

/** Quantity that gets booked for a node: actual, else planned, else 0. */
export function postedQuantity(node: ProcessNode): number {
  return node.actualQuantity ?? node.quantity ?? 0
}

/**
 * Desired net stock movement of an item node: +qty once its producing step is
 * done, -qty once a consuming step is done (an intermediate product that is
 * made by one step and used by another nets to zero).
 */
export function desiredNet(graph: ProcessGraph, node: ProcessNode): number {
  if (!isItem(node)) return 0
  const qty = postedQuantity(node)
  if (qty === 0) return 0
  let net = 0
  if (node.kind !== 'input' && isProduced(graph, node.id)) net += qty
  if (isConsumed(graph, node.id)) net -= qty
  return net
}

/** Net of the movements already booked for one (node, article) pair. */
export interface ExistingNet {
  processNodeId: string
  catalogItemId: string
  quantity: number
}

export interface PlannedMovement {
  processNodeId: string
  catalogItemId: string
  /** Signed. */
  quantity: number
  kind: 'consumption' | 'production' | 'adjustment'
}

/**
 * The movements that bring the ledger in line with the graph. Idempotent: with
 * `existing` already matching the graph nothing is returned; undoing a step
 * reverses its booking; a changed actual quantity posts only the delta. When a
 * node's article changed since it was booked, the old article is reversed and
 * the new one gets the full desired amount.
 */
export function planProcessPosting(graph: ProcessGraph, existing: readonly ExistingNet[]): PlannedMovement[] {
  const movements: PlannedMovement[] = []
  // Material taken by a done consuming step is consumption and output of a done
  // producing step is production; anything else (a step undone, a lower actual
  // quantity, a relinked or removed node) is a correction. Mirrors the API.
  const kindFor = (processNodeId: string, catalogItemId: string, diff: number): PlannedMovement['kind'] => {
    const node = graph.nodes.find((n) => n.id === processNodeId)
    if (!node || node.catalogItemId !== catalogItemId) return 'adjustment'
    if (diff < 0 && isConsumed(graph, node.id)) return 'consumption'
    if (diff > 0 && node.kind !== 'input' && isProduced(graph, node.id)) return 'production'
    return 'adjustment'
  }
  const push = (processNodeId: string, catalogItemId: string, diff: number): void => {
    if (Math.abs(diff) <= STOCK_EPSILON) return
    movements.push({
      processNodeId,
      catalogItemId,
      quantity: diff,
      kind: kindFor(processNodeId, catalogItemId, diff),
    })
  }

  for (const node of graph.nodes) {
    if (!isItem(node)) continue
    const target = node.catalogItemId || undefined
    // Anything booked against another article than the current link is reversed.
    for (const net of existing) {
      if (net.processNodeId === node.id && net.catalogItemId !== target) push(node.id, net.catalogItemId, -net.quantity)
    }
    if (!target) continue
    const booked = existing
      .filter((net) => net.processNodeId === node.id && net.catalogItemId === target)
      .reduce((sum, net) => sum + net.quantity, 0)
    push(node.id, target, desiredNet(graph, node) - booked)
  }
  // A node removed from the graph (admin structural edit) has its booking
  // reversed, matching the API.
  const present = new Set(graph.nodes.map((node) => node.id))
  for (const net of existing) {
    if (!present.has(net.processNodeId)) push(net.processNodeId, net.catalogItemId, -net.quantity)
  }
  return movements
}

/**
 * Planned quantity still to be taken from stock, per article: linked INPUT
 * nodes whose consuming step is not done yet. This is the contract's per-order
 * `reserved` contribution.
 */
export function reservedByArticle(graph: ProcessGraph): Map<string, number> {
  const reserved = new Map<string, number>()
  for (const node of graph.nodes) {
    if (node.kind !== 'input' || !node.catalogItemId) continue
    if (isConsumed(graph, node.id)) continue
    reserved.set(node.catalogItemId, (reserved.get(node.catalogItemId) ?? 0) + (node.quantity ?? 0))
  }
  return reserved
}

/** Sums `reservedByArticle` over the graphs of all open work orders. */
export function reservedAcrossGraphs(graphs: readonly ProcessGraph[]): Map<string, number> {
  const total = new Map<string, number>()
  for (const graph of graphs) {
    for (const [id, qty] of reservedByArticle(graph)) total.set(id, (total.get(id) ?? 0) + qty)
  }
  return total
}

/** Input nodes whose consumption is already booked (their stock is out). */
export function consumedInputIds(graph: ProcessGraph): Set<string> {
  return new Set(
    graph.nodes.filter((node) => node.kind === 'input' && isConsumed(graph, node.id)).map((node) => node.id),
  )
}

export function isLowStock(onHand: number, available: number, minStock: number | null): boolean {
  return onHand < 0 || (minStock !== null && available < minStock)
}

export interface CountPosting {
  catalogItemId: string
  /** counted - onHand */
  quantity: number
  /** "opening" when the article has no movements yet, else "adjustment". */
  kind: 'opening' | 'adjustment'
}

export interface CountSource {
  catalogItemId: string
  onHand: number
  hasMovements: boolean
}

/** Turns counted quantities into postings; zero deltas are skipped. */
export function planCountPosting(
  lines: readonly { catalogItemId: string; countedQuantity: number }[],
  sources: ReadonlyMap<string, CountSource>,
): CountPosting[] {
  const postings: CountPosting[] = []
  for (const line of lines) {
    const source = sources.get(line.catalogItemId)
    if (!source) continue
    const delta = roundQuantity(line.countedQuantity - source.onHand)
    if (Math.abs(delta) <= STOCK_EPSILON) continue
    postings.push({
      catalogItemId: line.catalogItemId,
      quantity: delta,
      kind: source.hasMovements ? 'adjustment' : 'opening',
    })
  }
  return postings
}

/* -------------------------------------------------------- UI projections */

export type StockMode = 'template' | 'order'

/** Levels by catalog item id. */
export type StockLevelMap = Readonly<Record<string, StockLevel>>

export function toLevelMap(levels: readonly StockLevel[]): Record<string, StockLevel> {
  return Object.fromEntries(levels.map((level) => [level.catalogItemId, level]))
}

/** One linked article with the totals of all input nodes that use it. */
export interface MaterialRow {
  catalogItemId: string
  name: string
  unit: string
  nodeIds: string[]
  nodeLabels: string[]
  /** Sum of planned quantities of all its input nodes. */
  planned: number
  /** Sum of actual quantities; null when none of the nodes has one. */
  actual: number | null
  /** Still to be taken from stock: (actual ?? planned) of the not-yet-consumed nodes. */
  required: number
  /** True when every input node of the article has already been consumed. */
  consumed: boolean
  onHand: number
  /**
   * What this process can draw on. Templates: on-hand. Work orders: available
   * plus the order's own reservation, so the order never blocks itself.
   */
  available: number
  /** max(0, required - available) */
  shortage: number
}

/**
 * The "Materijal" view of a graph: one row per linked article that has an input
 * node. Articles whose level is not (yet) known are left out rather than
 * guessed. Pure; the caller supplies the levels.
 */
export function materialRows(graph: ProcessGraph, mode: StockMode, levels: StockLevelMap): MaterialRow[] {
  const own = reservedByArticle(graph)
  const rows = new Map<string, MaterialRow>()
  for (const node of graph.nodes) {
    if (node.kind !== 'input' || !node.catalogItemId) continue
    const level = levels[node.catalogItemId]
    if (!level) continue
    const consumed = isConsumed(graph, node.id)
    const row =
      rows.get(level.catalogItemId) ??
      ({
        catalogItemId: level.catalogItemId,
        name: level.name,
        unit: level.unit,
        nodeIds: [],
        nodeLabels: [],
        planned: 0,
        actual: null,
        required: 0,
        consumed: true,
        onHand: level.onHand,
        available: mode === 'order' ? level.available + (own.get(level.catalogItemId) ?? 0) : level.onHand,
        shortage: 0,
      } satisfies MaterialRow)
    row.nodeIds.push(node.id)
    row.nodeLabels.push(node.label)
    row.planned += node.quantity ?? 0
    if (node.actualQuantity !== undefined) row.actual = (row.actual ?? 0) + node.actualQuantity
    if (!consumed) {
      row.consumed = false
      row.required += node.actualQuantity ?? node.quantity ?? 0
    }
    rows.set(level.catalogItemId, row)
  }
  return [...rows.values()].map((row) => ({
    ...row,
    planned: roundQuantity(row.planned),
    actual: row.actual === null ? null : roundQuantity(row.actual),
    required: roundQuantity(row.required),
    shortage: roundQuantity(shortageOf(row.required, row.available)),
  }))
}

/**
 * What this order still lacks: nothing when nothing is left to take (inputs
 * already consumed), and never more than it needs, even when other orders'
 * reservations push the available figure below zero.
 */
export function shortageOf(required: number, available: number): number {
  if (required <= STOCK_EPSILON) return 0
  return Math.max(0, required - Math.max(0, available))
}

/** Rows that cannot be covered. */
export function shortages(rows: readonly MaterialRow[]): MaterialRow[] {
  return rows.filter((row) => row.shortage > STOCK_EPSILON)
}

/** Linked article ids of the graph's item nodes, de-duplicated and sorted. */
export function linkedArticleIds(graph: ProcessGraph): string[] {
  return [...new Set(graph.nodes.filter((n) => isItem(n) && n.catalogItemId).map((n) => n.catalogItemId as string))].sort()
}

/** What the tester/simulator needs per article. `available` is already adjusted for the order's own reservation. */
export interface StockAvailabilityEntry {
  name: string
  unit: string
  onHand: number
  available: number
}

export interface StockContext {
  items: Readonly<Record<string, StockAvailabilityEntry>>
  /** Input nodes whose consumption is already booked; they need no stock any more. */
  settledNodeIds?: ReadonlySet<string>
}

/** Builds the simulator's stock context from loaded levels (see `materialRows` for the availability rule). */
export function stockContextFor(graph: ProcessGraph, mode: StockMode, levels: StockLevelMap): StockContext {
  const own = mode === 'order' ? reservedByArticle(graph) : new Map<string, number>()
  const items: Record<string, StockAvailabilityEntry> = {}
  for (const id of linkedArticleIds(graph)) {
    const level = levels[id]
    if (!level) continue
    items[id] = {
      name: level.name,
      unit: level.unit,
      onHand: level.onHand,
      available: mode === 'order' ? level.available + (own.get(id) ?? 0) : level.onHand,
    }
  }
  return { items, settledNodeIds: mode === 'order' ? consumedInputIds(graph) : undefined }
}
