import { roundPlanned } from '@/lib/process/quantities'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import {
  MAX_MATERIAL_NEEDS_WEEKS,
  type MaterialNeeds,
  type MaterialNeedsItem,
  type MaterialNeedsWeek,
  type PlanAssignment,
  type ProductionPlan,
} from '@/types/planning'
import type { StockLevel } from '@/types/stock'

// Material needs by week (D-028) for fixture mode: a pure TypeScript twin of
// `iris-api/internal/planner/material_needs.go` (keep the rules in sync).

const STOCK_EPSILON = 1e-9

/** One open order's process copy; `factor` scales its per-unit input quantities. */
export interface MaterialOrder {
  workOrderId: string
  graph: ProcessGraph
  factor: number
}

export interface MaterialNeedsInput {
  weeks: MaterialNeedsWeek[]
  /** Published plans: the most recent one before the window and every later one. */
  plans: ProductionPlan[]
  orders: MaterialOrder[]
  /** Stock level per linked article; a missing article gets no stock figures. */
  stock: Map<string, StockLevel>
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Days since Monday (Monday = 0). */
function sinceMonday(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

export type MaterialWindowProblem = 'date' | 'order' | 'span'

/**
 * Calendar weeks (Monday–Sunday) covering from..to, the first and last
 * clipped to the window; a problem when a date is malformed, to < from, or
 * the window touches more than MAX_MATERIAL_NEEDS_WEEKS weeks.
 */
export function materialWeeks(from: string, to: string): MaterialNeedsWeek[] | MaterialWindowProblem {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return 'date'
  if (end < start) return 'order'
  const weeks: MaterialNeedsWeek[] = []
  for (let day = start; day <= end; ) {
    let sunday = shiftDays(day, 6 - sinceMonday(day))
    if (sunday > end) sunday = end
    if (weeks.length === MAX_MATERIAL_NEEDS_WEEKS) return 'span'
    weeks.push({ start: iso(day), end: iso(sunday) })
    day = shiftDays(sunday, 1)
  }
  return weeks
}

/**
 * The default end of the window: the latest published horizon end when it
 * reaches `from`, else `defaultDays` from `from`; clipped to the eighth week.
 */
export function defaultMaterialNeedsEnd(from: string, plans: ProductionPlan[], defaultDays: number): string {
  const start = parseDate(from)
  if (!start) return from
  let end = plans.reduce((latest, plan) => (plan.horizonEnd > latest ? plan.horizonEnd : latest), '')
  if (end < from) end = iso(shiftDays(start, defaultDays - 1))
  const last = iso(shiftDays(start, 7 * MAX_MATERIAL_NEEDS_WEEKS - 1 - sinceMonday(start)))
  return end > last ? last : end
}

const blockDate = (block: PlanAssignment): string => block.start.slice(0, 10)

/**
 * The published blocks that stand for each date from `from` on: a date's own
 * published plan, else the most recent earlier plan's projection.
 */
export function effectiveBlocks(plans: ProductionPlan[], from: string): PlanAssignment[] {
  const ordered = [...plans].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const blocks: PlanAssignment[] = []
  ordered.forEach((plan, index) => {
    const lower = plan.date < from ? from : plan.date
    const upper = ordered[index + 1]?.date
    for (const block of plan.assignments) {
      const date = blockDate(block)
      if (date < lower || (upper !== undefined && date >= upper)) continue
      blocks.push(block)
    }
  })
  return blocks.sort((a, b) =>
    a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
}

interface InputNeed {
  node: ProcessNode
  quantity: number
  /** First planned block of its open consumers; '' = none. */
  date: string
}

function orderInputNeeds(order: MaterialOrder, firstBlock: Map<string, string>): InputNeed[] {
  const steps = new Map(order.graph.nodes.filter((node) => node.kind === 'step').map((node) => [node.id, node]))
  const consumers = new Map<string, string[]>()
  for (const edge of order.graph.edges) {
    if (!steps.has(edge.target)) continue
    consumers.set(edge.source, [...(consumers.get(edge.source) ?? []), edge.target])
  }
  const needs: InputNeed[] = []
  for (const node of order.graph.nodes) {
    if (node.kind !== 'input' || node.quantity === undefined || !(node.quantity > 0)) continue
    let consumed = false
    let open = false
    let date = ''
    for (const stepId of consumers.get(node.id) ?? []) {
      const status = steps.get(stepId)?.status
      if (status === 'done') consumed = true
      else if (status !== 'skipped') {
        open = true
        const first = firstBlock.get(`${order.workOrderId}\u0000${stepId}`)
        if (first !== undefined && (date === '' || first < date)) date = first
      }
    }
    if (consumed || !open) continue
    const quantity = roundPlanned(node.quantity * order.factor)
    if (!(quantity > 0) || !Number.isFinite(quantity)) continue
    needs.push({ node, quantity, date })
  }
  return needs
}

interface Bucket {
  item: MaterialNeedsItem
  weeks: number[]
  unplanned: number
}

function bucketFor(node: ProcessNode, stock: Map<string, StockLevel>, buckets: Map<string, Bucket>, weeks: number): [string, Bucket] {
  const id = (node.catalogItemId ?? '').trim()
  if (id) {
    const key = `article\u0000${id}`
    const existing = buckets.get(key)
    if (existing) return [key, existing]
    const level = stock.get(id)
    const item: MaterialNeedsItem = {
      catalogItemId: id,
      name: level?.name ?? node.label.trim(),
      unit: level?.unit ?? (node.unit ?? '').trim(),
      onHand: level?.onHand ?? null,
      reserved: level?.reserved ?? null,
      available: level?.available ?? null,
      weeks: [],
      cumulative: [],
      unplanned: 0,
      shortFromWeek: null,
    }
    return [key, { item, weeks: new Array<number>(weeks).fill(0), unplanned: 0 }]
  }
  const name = node.label.trim()
  const unit = (node.unit ?? '').trim()
  const key = `input\u0000${name.toLowerCase()}\u0000${unit.toLowerCase()}`
  const existing = buckets.get(key)
  if (existing) return [key, existing]
  const item: MaterialNeedsItem = {
    catalogItemId: null,
    name,
    unit,
    onHand: null,
    reserved: null,
    available: null,
    weeks: [],
    cumulative: [],
    unplanned: 0,
    shortFromWeek: null,
  }
  return [key, { item, weeks: new Array<number>(weeks).fill(0), unplanned: 0 }]
}

function finish(bucket: Bucket): MaterialNeedsItem {
  const item: MaterialNeedsItem = { ...bucket.item, weeks: [], cumulative: [] }
  let total = 0
  bucket.weeks.forEach((quantity, index) => {
    item.weeks.push(roundPlanned(quantity))
    total += quantity
    const cumulative = roundPlanned(total)
    item.cumulative.push(cumulative)
    if (item.shortFromWeek === null && item.onHand !== null && cumulative > item.onHand + STOCK_EPSILON) {
      item.shortFromWeek = index
    }
  })
  item.unplanned = roundPlanned(bucket.unplanned)
  return item
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function compareItems(a: MaterialNeedsItem, b: MaterialNeedsItem): number {
  if ((a.shortFromWeek === null) !== (b.shortFromWeek === null)) return a.shortFromWeek !== null ? -1 : 1
  if (a.shortFromWeek !== null && b.shortFromWeek !== null && a.shortFromWeek !== b.shortFromWeek) {
    return a.shortFromWeek - b.shortFromWeek
  }
  const byName = compareText(a.name.toLowerCase(), b.name.toLowerCase())
  if (byName !== 0) return byName
  if ((a.catalogItemId === null) !== (b.catalogItemId === null)) return a.catalogItemId !== null ? -1 : 1
  if (a.catalogItemId !== null && b.catalogItemId !== null && a.catalogItemId !== b.catalogItemId) {
    return compareText(a.catalogItemId, b.catalogItemId)
  }
  return compareText(a.unit.toLowerCase(), b.unit.toLowerCase())
}

/**
 * Input material per week (see the Go twin for the rules): open inputs fall in
 * the week of their consuming steps' first planned block, unplanned ones in
 * `unplanned`, those first planned after the window nowhere; shortages first.
 */
export function buildMaterialNeeds(input: MaterialNeedsInput): MaterialNeeds {
  const weeks = input.weeks.map((week) => ({ ...week }))
  if (weeks.length === 0) return { from: '', to: '', weeks, items: [] }
  const from = weeks[0].start
  const to = weeks[weeks.length - 1].end

  const firstBlock = new Map<string, string>()
  for (const block of effectiveBlocks(input.plans, from)) {
    const key = `${block.workOrderId}\u0000${block.stepNodeId}`
    const date = blockDate(block)
    const known = firstBlock.get(key)
    if (known === undefined || date < known) firstBlock.set(key, date)
  }

  const orders = [...input.orders].sort((a, b) => compareText(a.workOrderId, b.workOrderId))
  const buckets = new Map<string, Bucket>()
  for (const order of orders) {
    for (const need of orderInputNeeds(order, firstBlock)) {
      let week = -1
      if (need.date !== '') {
        if (need.date > to) continue
        const index = weeks.findIndex((entry) => need.date <= entry.end)
        week = index === -1 ? weeks.length - 1 : index
      }
      const [key, bucket] = bucketFor(need.node, input.stock, buckets, weeks.length)
      buckets.set(key, bucket)
      if (week < 0) bucket.unplanned += need.quantity
      else bucket.weeks[week] += need.quantity
    }
  }
  const items = [...buckets.values()].map(finish).sort(compareItems)
  return { from, to, weeks, items }
}
