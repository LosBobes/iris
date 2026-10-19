// Latest start (D-028): fixture-mode twin of iris-api/internal/planner/latest_start.go.
// An informational backward pass from an order's due date over its remaining
// steps: durations plus the inter-operation time, in working time only
// (machines, people and other orders are ignored). Pure and deterministic.

import { stepStatus } from '@/lib/process/graph'
import type { ProcessGraph, ProcessNode } from '@/types/process'

/** A stretch of working time, minutes after local midnight. */
export interface WorkSegment {
  start: number
  end: number
}

/** The working segments of a civil date ("YYYY-MM-DD"), sorted; empty on a day off. */
export type SegmentsOn = (date: string) => readonly WorkSegment[]

interface Moment {
  date: string
  minutes: number
}

/** How far back the pass looks for working time (the Go lagHorizonDays). */
export const LATEST_START_WINDOW_DAYS = 120

const DAY_MS = 86_400_000

function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - days * DAY_MS).toISOString().slice(0, 10)
}

function isOpen(step: ProcessNode): boolean {
  const status = stepStatus(step)
  return status !== 'done' && status !== 'skipped'
}

/** The end of the last working shift on or before `date`; null when none lies in the window. */
export function dueEnd(segmentsOn: SegmentsOn, date: string): Moment | null {
  for (let back = 0; back <= LATEST_START_WINDOW_DAYS; back++) {
    const current = minusDays(date, back)
    const segments = segmentsOn(current)
    if (segments.length > 0) return { date: current, minutes: segments[segments.length - 1].end }
  }
  return null
}

/**
 * The moment `minutes` of working time before `from`: the mirror of laying
 * work forward. Work pauses for breaks, the time before a shift and days off.
 * Null when the minutes do not fit within the window.
 */
export function beforeWorkingMinutes(segmentsOn: SegmentsOn, from: Moment, minutes: number): Moment | null {
  if (minutes <= 0) return from
  let remaining = minutes
  for (let back = 0; back <= LATEST_START_WINDOW_DAYS; back++) {
    const date = minusDays(from.date, back)
    const segments = segmentsOn(date)
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]
      const end = back === 0 ? Math.min(segment.end, from.minutes) : segment.end
      if (end <= segment.start) continue
      const available = end - segment.start
      if (remaining > available) {
        remaining -= available
        continue
      }
      return { date, minutes: end - remaining }
    }
  }
  return null
}

function earlier(a: Moment, b: Moment): boolean {
  return a.date < b.date || (a.date === b.date && a.minutes < b.minutes)
}

/** The steps directly after `id`, looking through item nodes (the Go graphIndex.successors). */
function successorSteps(graph: ProcessGraph, outgoing: Map<string, string[]>, id: string): ProcessNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>([id])
  const stack = [...(outgoing.get(id) ?? [])]
  const steps: ProcessNode[] = []
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (seen.has(current)) continue
    seen.add(current)
    const node = byId.get(current)
    if (!node) continue
    if (node.kind === 'step') {
      steps.push(node)
      continue
    }
    stack.push(...(outgoing.get(current) ?? []))
  }
  return steps
}

/**
 * The local date the order's remaining work must start by to finish by the
 * end of its due date's shift (the last working shift on or before it when the
 * due date is a day off). Each open step's latest finish is that end or, with
 * open successors, the earliest of their latest starts less `transferMinutes`;
 * its latest start is that finish less its duration. The result is the
 * earliest over the open steps (the longest chain). In-progress steps count
 * with their full duration.
 *
 * Null without a due date or open steps, when `durationOf` returns null for an
 * open step (no times set), or when the calendar has no working time in the window.
 */
export function latestStartOf(
  graph: ProcessGraph,
  dueDate: string | null,
  transferMinutes: number,
  durationOf: (step: ProcessNode) => number | null,
  segmentsOn: SegmentsOn,
): string | null {
  if (!dueDate) return null
  const open = graph.nodes.filter((node) => node.kind === 'step' && isOpen(node))
  if (open.length === 0) return null
  const durations = new Map<string, number>()
  for (const step of open) {
    const minutes = durationOf(step)
    if (minutes === null) return null
    durations.set(step.id, minutes)
  }
  const end = dueEnd(segmentsOn, dueDate)
  if (!end) return null

  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.source)
    if (list) list.push(edge.target)
    else outgoing.set(edge.source, [edge.target])
  }
  const memo = new Map<string, Moment | null>()
  const visiting = new Set<string>()
  const latest = (step: ProcessNode): Moment | null => {
    if (memo.has(step.id)) return memo.get(step.id) ?? null
    // A validated graph has no cycle; treat such an edge as absent.
    if (visiting.has(step.id)) return end
    visiting.add(step.id)
    let finish: Moment | null = end
    for (const next of successorSteps(graph, outgoing, step.id)) {
      if (!isOpen(next)) continue
      const nextStart = latest(next)
      const before = nextStart ? beforeWorkingMinutes(segmentsOn, nextStart, transferMinutes) : null
      if (!before) {
        finish = null
        break
      }
      if (earlier(before, finish)) finish = before
    }
    const start = finish ? beforeWorkingMinutes(segmentsOn, finish, durations.get(step.id) ?? 0) : null
    visiting.delete(step.id)
    memo.set(step.id, start)
    return start
  }
  let earliest: Moment | null = null
  for (const step of open) {
    const start = latest(step)
    if (!start) return null
    if (!earliest || earlier(start, earliest)) earliest = start
  }
  return earliest ? earliest.date : null
}
