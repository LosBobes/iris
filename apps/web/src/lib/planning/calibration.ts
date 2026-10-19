// Fixture-mode twin of the calibration report (iris-api/internal/planner/
// calibration.go and store/planning_calibration.go, D-028): keep the rules in
// sync. Pure: the caller passes "today".

import { addDays, stepDurationMinutes, stepMoment, workingMinutesBetween } from '@/lib/planning/fixture-planner'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import {
  CALIBRATION_DEFAULT_DAYS,
  CALIBRATION_MAX_DAYS,
  MAX_TRANSFER_MINUTES,
  type PlanningCalibration,
  type PlanningCalibrationQuery,
  type PlanningCalibrationStep,
  type PlanningCalibrationWindow,
  type WorkingHours,
} from '@/types/planning'

export const CALIBRATION_MESSAGES = {
  badDate: 'Datum mora biti u formatu GGGG-MM-DD.',
  windowOrder: 'Početni datum mora biti pre krajnjeg ili isti.',
  windowSpan: `Period izveštaja može biti najviše ${CALIBRATION_MAX_DAYS} dana.`,
}

/** One finished order's process as the report needs it. */
export interface CalibrationOrderInput {
  /** Multiplies minutesPerUnit; below 1 counts as 1. */
  quantity: number
  graph: ProcessGraph
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * The report window: `to` defaults to today, `from` to 59 days before `to`.
 * Returns a Serbian message instead for malformed dates (400) or an inverted
 * or too long window (422).
 */
export function calibrationWindow(
  query: PlanningCalibrationQuery,
  today: string,
): { window: PlanningCalibrationWindow } | { status: 400 | 422; message: string } {
  const from = query.from?.trim() ?? ''
  const to = query.to?.trim() || today
  for (const value of [from, to]) {
    if (value && (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
      return { status: 400, message: CALIBRATION_MESSAGES.badDate }
    }
  }
  const start = from || addDays(to, -(CALIBRATION_DEFAULT_DAYS - 1))
  if (start > to) return { status: 422, message: CALIBRATION_MESSAGES.windowOrder }
  if (daysBetween(start, to) + 1 > CALIBRATION_MAX_DAYS) return { status: 422, message: CALIBRATION_MESSAGES.windowSpan }
  return { window: { from: start, to } }
}

/**
 * When a process finished: every step done or skipped, at least one done,
 * at the latest finishedAt; null otherwise (also without any finishedAt).
 */
export function processCompletion(graph: ProcessGraph): Date | null {
  let latest: Date | null = null
  let done = false
  for (const node of graph.nodes) {
    if (node.kind !== 'step') continue
    if (node.status === 'done') done = true
    else if (node.status !== 'skipped') return null
    if (!node.finishedAt) continue
    const at = new Date(node.finishedAt)
    if (Number.isNaN(at.getTime())) continue
    if (!latest || at > latest) latest = at
  }
  return done ? latest : null
}

/** The steps directly after `id`, looking through item nodes. */
function successorSteps(graph: ProcessGraph, id: string): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>([id])
  const stack = graph.edges.filter((edge) => edge.source === id).map((edge) => edge.target)
  const steps: string[] = []
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (seen.has(current)) continue
    seen.add(current)
    const node = nodes.get(current)
    if (!node) continue
    if (node.kind === 'step') {
      steps.push(current)
      continue
    }
    for (const edge of graph.edges) if (edge.source === current) stack.push(edge.target)
  }
  return steps.sort()
}

/** The chain with the most done (measured) steps, then the most minutes: [count, minutes]. */
function longestDoneChain(graph: ProcessGraph, actual: Map<string, number>): [number, number] {
  const memo = new Map<string, [number, number]>()
  const visiting = new Set<string>()
  const better = (a: [number, number], b: [number, number]): boolean => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1])
  const walk = (id: string): [number, number] => {
    const known = memo.get(id)
    if (known) return known
    if (visiting.has(id)) return [0, 0]
    visiting.add(id)
    let tail: [number, number] = [0, 0]
    for (const next of successorSteps(graph, id)) {
      const value = walk(next)
      if (better(value, tail)) tail = value
    }
    visiting.delete(id)
    const minutes = actual.get(id)
    const own: [number, number] = minutes === undefined ? tail : [tail[0] + 1, tail[1] + minutes]
    memo.set(id, own)
    return own
  }
  let top: [number, number] = [0, 0]
  for (const node of graph.nodes) {
    if (node.kind !== 'step') continue
    const value = walk(node.id)
    if (better(value, top)) top = value
  }
  return top
}

function transferRecommendation(minutes: number): number {
  return Math.min(MAX_TRANSFER_MINUTES, Math.max(0, Math.round(minutes / 5) * 5))
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

function hasTimes(step: ProcessNode): boolean {
  return step.setupMinutes != null || step.minutesPerUnit != null
}

/** The computed part of the report (see `planner.Calibrate`). */
export function calibrate(
  hours: WorkingHours,
  orders: readonly CalibrationOrderInput[],
): Pick<PlanningCalibration, 'ordersWithTimes' | 'avgTransferMinutes' | 'medianTransferMinutes' | 'steps'> {
  const byLabel = new Map<string, { count: number; planned: number; actual: number }>()
  const samples: number[] = []
  let ordersWithTimes = 0
  for (const order of orders) {
    const actual = new Map<string, number>()
    let allTimes = true
    let anyDone = false
    let first: string | null = null
    let last: string | null = null
    const steps = order.graph.nodes.filter((node) => node.kind === 'step').sort((a, b) => a.id.localeCompare(b.id))
    for (const step of steps) {
      if (step.status !== 'done') continue
      anyDone = true
      const start = stepMoment(step.startedAt, hours.timeZone)
      const end = stepMoment(step.finishedAt, hours.timeZone)
      if (!start || !end || !step.startedAt || !step.finishedAt || new Date(step.finishedAt) < new Date(step.startedAt)) {
        allTimes = false
        continue
      }
      const minutes = workingMinutesBetween(hours, start, end)
      actual.set(step.id, minutes)
      if (first === null || new Date(step.startedAt) < new Date(first)) first = step.startedAt
      if (last === null || new Date(step.finishedAt) > new Date(last)) last = step.finishedAt
      const label = step.label.trim()
      if (label && hasTimes(step)) {
        const sum = byLabel.get(label) ?? { count: 0, planned: 0, actual: 0 }
        sum.count += 1
        sum.planned += stepDurationMinutes(step, order.quantity)
        sum.actual += minutes
        byLabel.set(label, sum)
      }
    }
    if (!anyDone || !allTimes) continue
    ordersWithTimes += 1
    const [count, tech] = longestDoneChain(order.graph, actual)
    if (count < 2 || first === null || last === null) continue
    const from = stepMoment(first, hours.timeZone)
    const to = stepMoment(last, hours.timeZone)
    if (!from || !to) continue
    const cycle = workingMinutesBetween(hours, from, to)
    samples.push((cycle - tech) / (count - 1))
  }

  let avgTransferMinutes: number | null = null
  let medianTransferMinutes: number | null = null
  if (samples.length > 0) {
    avgTransferMinutes = transferRecommendation(samples.reduce((total, value) => total + value, 0) / samples.length)
    const sorted = [...samples].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    medianTransferMinutes = transferRecommendation(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid])
  }

  const steps: PlanningCalibrationStep[] = []
  for (const [label, sum] of byLabel) {
    const planned = sum.planned / sum.count
    if (planned <= 0) continue
    const actualAvg = sum.actual / sum.count
    steps.push({
      label,
      count: sum.count,
      plannedMinutesAvg: roundTo(planned, 1),
      actualMinutesAvg: roundTo(actualAvg, 1),
      ratio: roundTo(actualAvg / planned, 2),
    })
  }
  steps.sort(
    (a, b) =>
      Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1) || b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  )
  return { ordersWithTimes, avgTransferMinutes, medianTransferMinutes, steps }
}

/** The orders completed in the window (local date of processCompletion), cancelled ones left out. */
export function ordersCompletedIn(
  window: PlanningCalibrationWindow,
  timeZone: string,
  orders: readonly { status: string; quantity: number | null; graph: ProcessGraph }[],
  localDate: (instant: Date, timeZone: string) => string,
): CalibrationOrderInput[] {
  const result: CalibrationOrderInput[] = []
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    const completed = processCompletion(order.graph)
    if (!completed) continue
    const date = localDate(completed, timeZone)
    if (date < window.from || date > window.to) continue
    result.push({ quantity: order.quantity ?? 1, graph: order.graph })
  }
  return result
}
