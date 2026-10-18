import i18n from '@/i18n'
import type { ProcessGraph, ProcessNode, ProcessStepStatus } from '@/types/process'
import type { StockContext } from '@/lib/stock/posting'
import { STOCK_EPSILON, shortageOf } from '@/lib/stock/posting'
import { hasCycle, predecessorSteps, validateGraph } from './graph'

// Pure, client-side process "tester" and "simulator". Nothing here touches the
// API or mutates the graph it is given.

/* ------------------------------------------------------------------ tester */

export type IssueSeverity = 'error' | 'warning'

export type IssueCode =
  | 'invalid'
  | 'stepNoInput'
  | 'startHasUpstream'
  | 'stepDeadEnd'
  | 'itemIsolated'
  | 'inputUnused'
  | 'noProduct'
  | 'itemUnproduced'
  | 'stepUnreachable'
  | 'inputUnlinked'
  | 'insufficientStock'

export interface ProcessIssue {
  severity: IssueSeverity
  code: IssueCode
  /** Nodes to highlight; empty for graph-wide issues. */
  nodeIds: string[]
  message: string
}

function labelOf(node: ProcessNode): string {
  return node.label.trim() || i18n.t('process.untitled')
}

/**
 * The "tester". Hard errors are exactly `validateGraph`'s messages. Warnings are
 * structural smells that the server accepts but that usually mean a mistake:
 *
 * - `stepNoInput`: a step with no incoming edge at all (nothing feeds it: no
 *   input, product, byproduct or earlier step). Legitimate for a first step, so
 *   warn only; steps marked `start` are never flagged.
 * - `startHasUpstream`: a step marked `start` that an earlier step leads to
 *   (directly or through items), so it cannot actually start the process.
 * - `stepDeadEnd`: a step with no outgoing edge (leads to no step, product or
 *   byproduct).
 * - `itemIsolated`: an input/product/byproduct with no edge at all.
 * - `inputUnused`: an input that has edges but none leaving it (no step consumes it).
 * - `noProduct`: the process has steps but no product node at all.
 * - `itemUnproduced`: a product/byproduct that a step consumes but that no step
 *   produces (it has outgoing edges but no incoming ones).
 * - `stepUnreachable`: a step that cannot be reached from any "root" (a node
 *   with no incoming edges). In an acyclic graph every node is reachable from a
 *   root, so this only fires for steps caught in a cycle.
 *
 * With `options.stock` (the warehouse state; leave it out where stock does not
 * apply, e.g. the backoffice) two more checks run:
 *
 * - `inputUnlinked` (warning): an input node without a catalog article, so its
 *   stock is not tracked.
 * - `insufficientStock` (error): the simulated run (`options.quantity`, minus
 *   `options.skipped` steps) needs more of a linked article than is available.
 *   One issue per article, highlighting all its input nodes.
 *
 * The function stays pure: stock is passed in, never fetched.
 *
 * Deliberately NOT flagged: a product or byproduct with no outgoing edge. That
 * is a terminal output (the final product or a by-product leaving the process),
 * which is the normal way for a process to end. A process may have any number
 * of starting steps and outputs.
 */
export interface AnalyzeOptions {
  /** Warehouse state; enables the stock checks. */
  stock?: StockContext
  /** Simulated quantity multiplier (default 1). */
  quantity?: number
  skipped?: ReadonlySet<string>
}

export function analyzeProcess(graph: ProcessGraph, options: AnalyzeOptions = {}): ProcessIssue[] {
  const issues: ProcessIssue[] = []
  for (const message of validateGraph(graph)) {
    issues.push({ severity: 'error', code: 'invalid', nodeIds: [], message })
  }

  const ids = new Set(graph.nodes.map((node) => node.id))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }
  const inCount = (id: string): number => incoming.get(id)?.length ?? 0
  const outCount = (id: string): number => outgoing.get(id)?.length ?? 0

  const warn = (code: IssueCode, nodes: ProcessNode[]): void => {
    for (const node of nodes) {
      issues.push({
        severity: 'warning',
        code,
        nodeIds: [node.id],
        message: i18n.t(`process.sim.issue.${code}`, { label: labelOf(node) }),
      })
    }
  }

  const steps = graph.nodes.filter((node) => node.kind === 'step')
  const items = graph.nodes.filter((node) => node.kind !== 'step')

  warn('itemIsolated', items.filter((node) => inCount(node.id) + outCount(node.id) === 0))
  warn('stepNoInput', steps.filter((node) => !node.start && inCount(node.id) === 0))
  warn('startHasUpstream', steps.filter((node) => node.start && predecessorSteps(graph, node.id).length > 0))
  warn('stepDeadEnd', steps.filter((node) => outCount(node.id) === 0))
  warn(
    'inputUnused',
    items.filter((node) => node.kind === 'input' && outCount(node.id) === 0 && inCount(node.id) + outCount(node.id) > 0),
  )
  warn(
    'itemUnproduced',
    items.filter((node) => node.kind !== 'input' && inCount(node.id) === 0 && outCount(node.id) > 0),
  )

  if (steps.length > 0 && !graph.nodes.some((node) => node.kind === 'product')) {
    issues.push({
      severity: 'warning',
      code: 'noProduct',
      nodeIds: [],
      message: i18n.t('process.sim.issue.noProduct'),
    })
  }

  // Reachability from every root (node without incoming edges).
  const reached = new Set<string>()
  const stack = graph.nodes.filter((node) => inCount(node.id) === 0).map((node) => node.id)
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (reached.has(id)) continue
    reached.add(id)
    for (const next of outgoing.get(id) ?? []) stack.push(next)
  }
  warn('stepUnreachable', steps.filter((node) => !reached.has(node.id)))

  if (options.stock) {
    warn('inputUnlinked', items.filter((node) => node.kind === 'input' && !node.catalogItemId))
    if (!hasCycle(graph)) {
      const plan = planSimulation(graph, { quantity: options.quantity, skipped: options.skipped })
      for (const row of stockRequirements(graph, plan, options.stock)) {
        if (row.shortage <= STOCK_EPSILON) continue
        issues.push({
          severity: 'error',
          code: 'insufficientStock',
          nodeIds: row.nodeIds,
          message: i18n.t('process.sim.issue.insufficientStock', {
            label: row.name,
            required: formatSimQuantity(row.required, row.unit),
            available: formatSimQuantity(row.available, row.unit),
          }),
        })
      }
    }
  }

  return issues
}

/* --------------------------------------------------------------- simulator */

export interface SimItem {
  nodeId: string
  label: string
  unit?: string
  /** Scaled quantity; undefined when the template has no planned quantity. */
  quantity?: number
}

export interface SimStep {
  id: string
  label: string
  skipped: boolean
}

export interface SimTick {
  /** 1-based wave number. */
  index: number
  steps: SimStep[]
  /** Items first consumed by this wave's running steps. */
  consumed: SimItem[]
  products: SimItem[]
  byproducts: SimItem[]
}

export interface SimTotal {
  /** Empty string = no unit. */
  unit: string
  quantity: number
  /** Items in this group that have no planned quantity (not part of `quantity`). */
  unknown: number
}

export interface SimPlan {
  quantity: number
  ticks: SimTick[]
  /** True when the graph has a cycle; no ticks are produced. */
  cyclic: boolean
  totals: { inputs: SimTotal[]; products: SimTotal[]; byproducts: SimTotal[] }
  /** products / (products + byproducts) * 100, or null when not honestly computable. */
  yieldPercent: number | null
  stepTick: Record<string, number>
  consumedAt: Record<string, number>
  producedAt: Record<string, number>
  /** Items that never exist in this run (produced only by skipped steps). */
  unavailable: string[]
}

export interface SimulationOptions {
  /** Multiplier applied to every planned quantity; default 1, clamped to >= 0. */
  quantity?: number
  skipped?: ReadonlySet<string>
}

function scale(value: number | undefined, factor: number): number | undefined {
  if (value === undefined) return undefined
  return Math.round(value * factor * 1000) / 1000
}

function addTotals(items: SimItem[]): SimTotal[] {
  const byUnit = new Map<string, SimTotal>()
  for (const item of items) {
    const unit = item.unit?.trim() ?? ''
    const total = byUnit.get(unit) ?? { unit, quantity: 0, unknown: 0 }
    if (item.quantity === undefined) total.unknown += 1
    else total.quantity = Math.round((total.quantity + item.quantity) * 1000) / 1000
    byUnit.set(unit, total)
  }
  return [...byUnit.values()]
}

/**
 * Builds the playback plan: steps run in topological waves (a step starts once
 * every step upstream of it, through any items, has finished; independent
 * branches share a wave). An item consumed by several steps is listed once, at
 * the earliest wave that consumes it. Skipped steps consume and produce
 * nothing, and an item produced *only* by skipped steps never exists, so no
 * later step consumes it either. Totals and yield count final outputs only:
 * products/byproducts no step consumes afterwards, plus those marked `final`
 * (an output that is also partly used further on).
 */
export function planSimulation(graph: ProcessGraph, options: SimulationOptions = {}): SimPlan {
  const factor = Number.isFinite(options.quantity) ? Math.max(0, options.quantity as number) : 1
  const skipped = options.skipped ?? new Set<string>()
  const empty: SimPlan = {
    quantity: factor,
    ticks: [],
    cyclic: false,
    totals: { inputs: [], products: [], byproducts: [] },
    yieldPercent: null,
    stepTick: {},
    consumedAt: {},
    producedAt: {},
    unavailable: [],
  }
  if (hasCycle(graph)) return { ...empty, cyclic: true }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }

  // Wave of a step = 1 + the deepest step upstream of it (through items).
  const waveMemo = new Map<string, number>()
  const upstreamSteps = (id: string, seen = new Set<string>()): string[] => {
    const found: string[] = []
    for (const source of incoming.get(id) ?? []) {
      if (seen.has(source)) continue
      seen.add(source)
      if (byId.get(source)?.kind === 'step') found.push(source)
      else found.push(...upstreamSteps(source, seen))
    }
    return found
  }
  const waveOf = (id: string): number => {
    const known = waveMemo.get(id)
    if (known !== undefined) return known
    const wave = 1 + Math.max(0, ...upstreamSteps(id).map(waveOf))
    waveMemo.set(id, wave)
    return wave
  }

  const stepNodes = graph.nodes.filter((node) => node.kind === 'step')
  const stepTick: Record<string, number> = {}
  for (const step of stepNodes) stepTick[step.id] = waveOf(step.id)
  const waveCount = Math.max(0, ...Object.values(stepTick))

  const toItem = (node: ProcessNode): SimItem => ({
    nodeId: node.id,
    label: labelOf(node),
    unit: node.unit,
    quantity: scale(node.quantity, factor),
  })

  // An item exists if nothing produces it (raw input) or some running step does.
  const producedAt: Record<string, number> = {}
  const unavailable: string[] = []
  for (const node of graph.nodes) {
    if (node.kind === 'step') continue
    const producers = (incoming.get(node.id) ?? []).filter((id) => byId.get(id)?.kind === 'step')
    if (producers.length === 0) continue
    const live = producers.filter((id) => !skipped.has(id))
    if (live.length === 0) unavailable.push(node.id)
    else producedAt[node.id] = Math.min(...live.map((id) => stepTick[id]))
  }
  const available = (id: string): boolean => !unavailable.includes(id)

  const consumedAt: Record<string, number> = {}
  const ticks: SimTick[] = []
  for (let index = 1; index <= waveCount; index += 1) {
    const stepsHere = stepNodes.filter((step) => stepTick[step.id] === index)
    const consumed: SimItem[] = []
    const products: SimItem[] = []
    const byproducts: SimItem[] = []
    for (const step of stepsHere) {
      if (skipped.has(step.id)) continue
      for (const sourceId of incoming.get(step.id) ?? []) {
        const source = byId.get(sourceId) as ProcessNode
        if (source.kind === 'step' || !available(sourceId) || consumedAt[sourceId] !== undefined) continue
        consumedAt[sourceId] = index
        consumed.push(toItem(source))
      }
      for (const targetId of outgoing.get(step.id) ?? []) {
        const target = byId.get(targetId) as ProcessNode
        if (target.kind === 'product' && producedAt[targetId] === index && !products.some((p) => p.nodeId === targetId)) {
          products.push(toItem(target))
        } else if (
          target.kind === 'byproduct' &&
          producedAt[targetId] === index &&
          !byproducts.some((p) => p.nodeId === targetId)
        ) {
          byproducts.push(toItem(target))
        }
      }
    }
    ticks.push({
      index,
      steps: stepsHere.map((step) => ({ id: step.id, label: labelOf(step), skipped: skipped.has(step.id) })),
      consumed,
      products,
      byproducts,
    })
  }

  // Totals and yield count only final outputs; an intermediate product that a
  // later step consumes is not an output of the process unless marked `final`.
  const isFinal = (item: SimItem): boolean =>
    Boolean(byId.get(item.nodeId)?.final) || (outgoing.get(item.nodeId)?.length ?? 0) === 0
  const allProducts = ticks.flatMap((tick) => tick.products).filter(isFinal)
  const allByproducts = ticks.flatMap((tick) => tick.byproducts).filter(isFinal)
  const totals = {
    inputs: addTotals(ticks.flatMap((tick) => tick.consumed).filter((item) => byId.get(item.nodeId)?.kind === 'input')),
    products: addTotals(allProducts),
    byproducts: addTotals(allByproducts),
  }

  return {
    quantity: factor,
    ticks,
    cyclic: false,
    totals,
    yieldPercent: computeYield(allProducts, allByproducts),
    stepTick,
    consumedAt,
    producedAt,
    unavailable,
  }
}

/**
 * Honest yield: only when every produced item has a quantity and they all share
 * one non-empty unit. Otherwise null, so we never mix kg with pieces.
 */
export function computeYield(products: SimItem[], byproducts: SimItem[]): number | null {
  const all = [...products, ...byproducts]
  if (products.length === 0 || all.some((item) => item.quantity === undefined)) return null
  const unit = products[0].unit?.trim() ?? ''
  if (unit === '' || all.some((item) => (item.unit?.trim() ?? '') !== unit)) return null
  const made = products.reduce((sum, item) => sum + (item.quantity as number), 0)
  const total = all.reduce((sum, item) => sum + (item.quantity as number), 0)
  if (total <= 0) return null
  return Math.round((made / total) * 1000) / 10
}

/** What a simulated run needs of one linked article, against the warehouse. */
export interface StockRequirement {
  catalogItemId: string
  name: string
  unit: string
  /** Input nodes of this article consumed in the run. */
  nodeIds: string[]
  /** Scaled planned quantity needed. */
  required: number
  onHand: number
  /** Available to this process (a work order's own reservation is already added back). */
  available: number
  /** max(0, required - available) */
  shortage: number
}

/**
 * Requirement of the simulated run per linked article: scaled planned
 * quantities of the linked input nodes that a running (not skipped) step
 * consumes. Nodes in `stock.settledNodeIds` are left out (their stock is
 * already booked out), and so are articles missing from `stock.items` (unknown
 * stock is never guessed). Pure.
 */
export function stockRequirements(graph: ProcessGraph, plan: SimPlan, stock: StockContext): StockRequirement[] {
  const rows = new Map<string, StockRequirement>()
  for (const node of graph.nodes) {
    if (node.kind !== 'input' || !node.catalogItemId) continue
    if (plan.consumedAt[node.id] === undefined || stock.settledNodeIds?.has(node.id)) continue
    const entry = stock.items[node.catalogItemId]
    if (!entry) continue
    const row = rows.get(node.catalogItemId) ?? {
      catalogItemId: node.catalogItemId,
      name: entry.name,
      unit: entry.unit,
      nodeIds: [],
      required: 0,
      onHand: entry.onHand,
      available: entry.available,
      shortage: 0,
    }
    row.nodeIds.push(node.id)
    row.required += scale(node.quantity, plan.quantity) ?? 0
    rows.set(node.catalogItemId, row)
  }
  return [...rows.values()].map((row) => {
    const required = Math.round(row.required * 1000) / 1000
    return { ...row, required, shortage: Math.round(shortageOf(required, row.available) * 1000) / 1000 }
  })
}

/** "12.5 kg", "40" or "—" when the quantity is unknown. */
export function formatSimQuantity(quantity: number | undefined, unit?: string): string {
  if (quantity === undefined) return '—'
  const value = new Intl.NumberFormat('sr-Latn', { maximumFractionDigits: 3 }).format(quantity)
  return unit?.trim() ? `${value} ${unit.trim()}` : value
}

/* ---------------------------------------------------------------- playback */

export type SimNodeState = 'idle' | 'running' | 'done' | 'skipped' | 'consumed' | 'produced' | 'unavailable'

/** Position 0 = not started; 2k-1 = wave k running; 2k = wave k finished. */
export function maxPosition(plan: SimPlan): number {
  return plan.ticks.length * 2
}

/** The wave (1-based) active or most recently finished at `position`; 0 before the start. */
export function waveAt(position: number): number {
  return Math.ceil(position / 2)
}

/** Visual state of every node at a playback position. */
export function nodeStatesAt(graph: ProcessGraph, plan: SimPlan, position: number): Map<string, SimNodeState> {
  const states = new Map<string, SimNodeState>()
  for (const node of graph.nodes) {
    if (node.kind === 'step') {
      const tick = plan.stepTick[node.id]
      const skipped = plan.ticks[tick - 1]?.steps.find((step) => step.id === node.id)?.skipped
      if (tick === undefined) states.set(node.id, 'idle')
      else if (skipped) states.set(node.id, 'skipped')
      else if (position >= 2 * tick) states.set(node.id, 'done')
      else if (position === 2 * tick - 1) states.set(node.id, 'running')
      else states.set(node.id, 'idle')
      continue
    }
    const consumed = plan.consumedAt[node.id]
    const produced = plan.producedAt[node.id]
    if (plan.unavailable.includes(node.id)) states.set(node.id, 'unavailable')
    else if (consumed !== undefined && position >= 2 * consumed - 1) states.set(node.id, 'consumed')
    else if (produced !== undefined && position >= 2 * produced) states.set(node.id, 'produced')
    else states.set(node.id, 'idle')
  }
  return states
}

const STEP_STATUS: Record<string, ProcessStepStatus> = {
  idle: 'pending',
  running: 'in_progress',
  done: 'done',
  skipped: 'skipped',
}

/**
 * A display copy of the graph for the read-only view: step statuses follow the
 * playback, planned quantities are scaled. The input graph is never modified.
 */
export function simulationGraph(
  graph: ProcessGraph,
  states: ReadonlyMap<string, SimNodeState>,
  quantity: number,
): ProcessGraph {
  return {
    edges: graph.edges,
    nodes: graph.nodes.map((node) => {
      if (node.kind === 'step') {
        return { ...node, status: STEP_STATUS[states.get(node.id) ?? 'idle'] }
      }
      return { ...node, quantity: scale(node.quantity, quantity), actualQuantity: undefined }
    }),
  }
}
