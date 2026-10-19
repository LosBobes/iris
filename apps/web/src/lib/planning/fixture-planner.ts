// Fixture-mode twin of the Go planner (iris-api/internal/planner, D-026): a pure,
// deterministic greedy list-scheduler. It follows the same rules in a simplified
// form (see the Go package comment for the authoritative version):
//
// - steps start only after every upstream step (through any item nodes) finished
//   plus the inter-operation time `hours.transferMinutes` (D-028) in working
//   time (the lag pauses for breaks and the end of the shift and may cross a day
//   boundary; 0 chains steps back to back); done/skipped steps are finished,
//   in-progress steps are placed first and locked (never shifted by the lag);
// - duration = setup + per-unit x quantity (quantity < 1 counts as 1); a step
//   with no times is placed with 0 minutes and flagged `missing_duration`;
// - a machine-bound step needs one in-service unit of its type plus a crew whose
//   lead is qualified; machine and crew are busy for the whole block, and a
//   machine is busy during its downtime windows too (a pinned block overlapping
//   one is kept but flagged `machine_down`; D-028);
// - work happens inside shifts, pausing for breaks; an exception date (a day off
//   or one-off hours) replaces that date's weekday pattern; a step that does not
//   finish by the end of a shift carries over to the next working day on the
//   same machine and crew (one block per day);
// - most urgent first (slack to due date over the remaining chain, then priority
//   urgent > high > normal > low at equal slack, older order, order number);
// - every step goes to the earliest time its machine and crew are free, preferring
//   the least-loaded machine/people, then the lowest name;
// - the horizon is PLANNING_FORECAST_DAYS working days.

import { predecessorSteps, stepStatus } from '@/lib/process/graph'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import {
  PLANNING_FORECAST_DAYS,
  type Machine,
  type MachineDowntime,
  type MachineType,
  type OrderForecast,
  type PlanAssignment,
  type PlanDrift,
  type PlanIssue,
  type PlanIssueCode,
  type ProductionPlan,
  type WorkingDay,
  type WorkingHours,
} from '@/types/planning'

export interface PlannerWorker {
  userId: string
  username: string
  /** Machine types the worker may lead a step on. */
  machineTypeIds: string[]
  /** Presence by local date; a missing date counts as present. */
  presence: Record<string, boolean>
}

export interface PlannerOrder {
  id: string
  number: string
  clientName: string
  dueDate: string | null
  priority: string
  quantity: number
  graph: ProcessGraph
  createdAt: string
}

/** A local moment. */
export interface LocalMoment {
  date: string
  /** Minutes since local midnight. */
  minutes: number
}

export interface PlannerInput {
  hours: WorkingHours
  /** The plan's day, "YYYY-MM-DD". */
  date: string
  /** Nothing is placed before this (re-plan: now). Default: the start of the date's shift. */
  start?: LocalMoment
  horizonDays?: number
  machineTypes: MachineType[]
  machines: Machine[]
  /** Machine downtime windows: busy time on the unit (D-028). */
  downtimes?: MachineDowntime[]
  workers: PlannerWorker[]
  orders: PlannerOrder[]
  /** Blocks kept exactly as they are. */
  pinned?: PlanAssignment[]
}

export interface PlannerResult {
  /** Blocks of every day in the horizon. */
  assignments: PlanAssignment[]
  issues: PlanIssue[]
  forecast: OrderForecast[]
}

// ---- local date/time helpers ------------------------------------------------

const DAY_MS = 86_400_000

function parseDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(date: string, days: number): string {
  return new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(parseDate(date)).getUTCDay()
  return day === 0 ? 7 : day
}

export function parseClock(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function stamp(date: string, minutes: number): string {
  return `${date}T${clock(minutes)}`
}

function splitStamp(value: string): LocalMoment {
  const [date, time] = value.split('T')
  return { date, minutes: parseClock(time ?? '00:00') }
}

/** "YYYY-MM-DDTHH:MM" as "DD.MM.YYYY HH:MM" for messages. */
function humanStamp(value: string): string {
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y} ${time ?? '00:00'}`
}

/** The parsable downtime windows by machine id, each list sorted by start (lexical = chronological). */
function downtimesByMachine(downtimes: readonly MachineDowntime[] | undefined): Map<string, MachineDowntime[]> {
  const byMachine = new Map<string, MachineDowntime[]>()
  for (const downtime of downtimes ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(downtime.from) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(downtime.to)) continue
    if (downtime.from >= downtime.to) continue
    const list = byMachine.get(downtime.machineId) ?? []
    list.push(downtime)
    byMachine.set(downtime.machineId, list)
  }
  for (const list of byMachine.values()) list.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  return byMachine
}

/** The first downtime of a machine overlapping a block (zero-length blocks only when strictly inside). */
function downtimeHit(
  byMachine: Map<string, MachineDowntime[]>,
  machineId: string | null,
  start: string,
  end: string,
): MachineDowntime | undefined {
  if (!machineId) return undefined
  return byMachine.get(machineId)?.find((d) => (start === end ? d.from < start && start < d.to : d.from < end && start < d.to))
}

/** The local date and clock time of an instant in the given IANA time zone. */
export function localMoment(instant: Date, timeZone: string): LocalMoment {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant)
    const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00'
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: Number(get('hour')) * 60 + Number(get('minute')),
    }
  } catch {
    const iso = instant.toISOString()
    return { date: iso.slice(0, 10), minutes: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) }
  }
}

// ---- durations --------------------------------------------------------------

export function stepDurationMinutes(step: ProcessNode, quantity: number): number {
  const qty = Math.max(1, quantity || 1)
  return Math.ceil((step.setupMinutes ?? 0) + (step.minutesPerUnit ?? 0) * qty - 1e-9)
}

function hasTimes(step: ProcessNode): boolean {
  // Like the API: a step is timed as soon as either value is set (even to 0).
  return step.setupMinutes != null || step.minutesPerUnit != null
}

export function stepCrew(step: ProcessNode): number {
  return Math.max(1, step.crewSize ?? 1)
}

// ---- shifts -----------------------------------------------------------------

interface Segment {
  start: number
  end: number
}

/** The work intervals of a shift: the shift minus its breaks. */
function shiftSegments(day: WorkingDay): Segment[] {
  const breaks = [...day.breaks]
    .map((b) => ({ start: parseClock(b.start), end: parseClock(b.end) }))
    .sort((a, b) => a.start - b.start)
  const segments: Segment[] = []
  let cursor = parseClock(day.start)
  const end = parseClock(day.end)
  for (const b of breaks) {
    if (b.start > cursor) segments.push({ start: cursor, end: Math.min(b.start, end) })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < end) segments.push({ start: cursor, end })
  return segments.filter((segment) => segment.end > segment.start)
}

interface WorkDay {
  index: number
  date: string
  shiftStart: number
  shiftEnd: number
  segments: Segment[]
}

/** The shift of a civil date: its exception (D-028) first, then the weekday pattern; undefined on a day off. */
export function shiftOn(hours: WorkingHours, date: string): WorkingDay | undefined {
  const exception = (hours.exceptions ?? []).find((entry) => entry.date === date)
  if (exception) {
    if (exception.off) return undefined
    return { weekday: isoWeekday(date), start: exception.start ?? '', end: exception.end ?? '', breaks: exception.breaks ?? [] }
  }
  return hours.days.find((day) => day.weekday === isoWeekday(date))
}

/** The first `count` working days from `date` (the date itself when it is one). */
export function workingDays(hours: WorkingHours, date: string, count: number): WorkDay[] {
  const result: WorkDay[] = []
  if (hours.days.length === 0 && (hours.exceptions ?? []).every((exception) => exception.off)) return result
  for (let offset = 0; result.length < count && offset < count * 7 + 14; offset++) {
    const current = addDays(date, offset)
    const day = shiftOn(hours, current)
    if (!day) continue
    result.push({
      index: result.length,
      date: current,
      shiftStart: parseClock(day.start),
      shiftEnd: parseClock(day.end),
      segments: shiftSegments(day),
    })
  }
  return result
}

// ---- planner ----------------------------------------------------------------

interface Interval {
  start: number
  end: number
}

interface DayPiece {
  day: WorkDay
  start: number
  end: number
  minutes: number
}

const AXIS = 1440
// Urgent before high before normal before low (D-028); unknown values count as normal.
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
/** An axis moment past every horizon: a lag that never elapses, so nothing fits. */
const BEYOND_HORIZON = Number.MAX_SAFE_INTEGER / 4

/** The inter-operation time of a calendar as whole minutes (malformed = 0). */
export function transferMinutesOf(hours: WorkingHours): number {
  return Number.isFinite(hours.transferMinutes) ? Math.max(0, Math.floor(hours.transferMinutes)) : 0
}

/**
 * Consumes `lag` working minutes from `from` over `segments` (each on an
 * absolute axis), returning the moment the lag has elapsed, or `beyond` when
 * the segments run out first.
 */
function afterWorkingMinutes(segments: readonly Segment[], from: number, lag: number, beyond: number): number {
  if (lag <= 0) return from
  let remaining = lag
  for (const segment of segments) {
    const begin = Math.max(from, segment.start)
    if (begin >= segment.end) continue
    const take = Math.min(remaining, segment.end - begin)
    remaining -= take
    if (remaining <= 0) return begin + take
  }
  return beyond
}

function messageFor(code: PlanIssueCode, order: PlannerOrder, step?: ProcessNode): string {
  const what = step ? `Radni nalog ${order.number}, korak „${step.label}“` : `Radni nalog ${order.number}`
  switch (code) {
    case 'unknown_machine_type':
      return `${what}: tip mašine ne postoji.`
    case 'no_machine':
      return `${what}: nema mašine u upotrebi za traženi tip.`
    case 'no_workers':
      return `${what}: nema dovoljno prisutnih radnika ili nijedan nije osposobljen za mašinu.`
    case 'no_capacity':
      return `${what}: nema slobodnog kapaciteta u narednih ${PLANNING_FORECAST_DAYS} radnih dana.`
    case 'missing_duration':
      return `${what}: nije uneto trajanje (podešavanje i minuta po komadu).`
    case 'conflict':
      return `${what}: konflikt u rasporedu.`
    case 'machine_down':
      return `${what}: mašina je van pogona u planiranom periodu.`
  }
}

function overlaps(list: Interval[] | undefined, start: number, end: number): boolean {
  if (!list) return false
  return list.some((busy) => busy.start < end && start < busy.end)
}

export function planDay(input: PlannerInput): PlannerResult {
  const horizon = input.horizonDays && input.horizonDays > 0 ? input.horizonDays : PLANNING_FORECAST_DAYS
  const days = workingDays(input.hours, input.date, horizon)
  const dayByDate = new Map(days.map((day) => [day.date, day]))
  // Every working segment of the horizon on the axis, for the inter-operation lag.
  const axisSegments: Segment[] = days.flatMap((day) =>
    day.segments.map((segment) => ({ start: day.index * AXIS + segment.start, end: day.index * AXIS + segment.end })),
  )
  const lag = transferMinutesOf(input.hours)
  /** The earliest a successor may start after a step ending at `axis` (D-028). */
  const afterLag = (axis: number): number => afterWorkingMinutes(axisSegments, axis, lag, BEYOND_HORIZON)
  const start: LocalMoment | undefined = input.start
  const startAxis = ((): number => {
    const first = days[0]
    if (!first) return 0
    if (!start) return first.index * AXIS + first.shiftStart
    const day = dayByDate.get(start.date)
    if (day) return day.index * AXIS + Math.max(day.shiftStart, start.minutes)
    // A start on a non-working day: from the next working day's shift start.
    const next = days.find((candidate) => candidate.date > start.date)
    return next ? next.index * AXIS + next.shiftStart : first.index * AXIS + first.shiftStart
  })()

  const busy = new Map<string, Interval[]>()
  const planned = new Map<string, number>()
  const addBusy = (key: string, from: number, to: number): void => {
    const list = busy.get(key) ?? []
    list.push({ start: from, end: to })
    busy.set(key, list)
    planned.set(key, (planned.get(key) ?? 0) + (to - from))
  }

  const typeIds = new Set(input.machineTypes.map((type) => type.id))
  const machinesByType = new Map<string, Machine[]>()
  for (const machine of input.machines) {
    if (!machine.inService) continue
    const list = machinesByType.get(machine.machineTypeId) ?? []
    list.push(machine)
    machinesByType.set(machine.machineTypeId, list)
  }
  // The axis moment of any local stamp: inside a horizon day exactly; on a day
  // outside the horizon, just before the first day or just after the preceding one.
  const axisOf = (moment: LocalMoment): number => {
    const exact = dayByDate.get(moment.date)
    if (exact) return exact.index * AXIS + moment.minutes
    let previous: WorkDay | undefined
    for (const day of days) if (day.date < moment.date) previous = day
    return previous ? previous.index * AXIS + AXIS : -1
  }
  // Downtime windows are busy time on the unit (D-028); they add no load.
  const downtimes = downtimesByMachine(input.downtimes)
  for (const [machineId, list] of downtimes) {
    const key = `m:${machineId}`
    const existing = busy.get(key) ?? []
    for (const downtime of list) existing.push({ start: axisOf(splitStamp(downtime.from)), end: axisOf(splitStamp(downtime.to)) })
    busy.set(key, existing)
  }
  const workerOrder = (a: PlannerWorker, b: PlannerWorker): number =>
    (planned.get(a.userId) ?? 0) - (planned.get(b.userId) ?? 0) || a.username.localeCompare(b.username, 'sr')

  const assignments: PlanAssignment[] = []
  const issues: PlanIssue[] = []
  const orderIssues = new Map<string, Set<PlanIssueCode>>()
  const finish = new Map<string, number>() // `${orderId}:${stepId}` -> axis
  const lastBlock = new Map<string, string>() // orderId -> local date of the last block

  const flag = (code: PlanIssueCode, order: PlannerOrder, step?: ProcessNode): void => {
    issues.push({
      code,
      workOrderId: order.id,
      orderNumber: order.number,
      stepNodeId: step?.id,
      stepLabel: step?.label,
      message: messageFor(code, order, step),
    })
    const set = orderIssues.get(order.id) ?? new Set<PlanIssueCode>()
    set.add(code)
    orderIssues.set(order.id, set)
  }

  const axisOfDate = (date: string): number => {
    let found: WorkDay | undefined
    for (const day of days) if (day.date <= date) found = day
    if (!found) return -AXIS
    const extra = Math.round((parseDate(date) - parseDate(found.date)) / DAY_MS)
    return found.index * AXIS + found.shiftEnd + (found.date === date ? 0 : extra * AXIS)
  }

  // Consume `minutes` of work from `from` (inside a working day) day by day.
  const layout = (minutes: number, dayIndex: number, from: number): DayPiece[] | null => {
    const pieces: DayPiece[] = []
    let remaining = minutes
    let index = dayIndex
    let cursor = from
    while (index < days.length) {
      const day = days[index]
      let first = -1
      let last = -1
      let used = 0
      for (const segment of day.segments) {
        if (remaining <= 0) break
        const begin = Math.max(segment.start, cursor)
        if (begin >= segment.end) continue
        const take = Math.min(remaining, segment.end - begin)
        if (first < 0) first = begin
        last = begin + take
        used += take
        remaining -= take
      }
      if (used > 0) pieces.push({ day, start: first, end: last, minutes: used })
      if (remaining <= 0) return pieces
      index += 1
      cursor = 0
    }
    return null
  }

  /** Normalises an axis time into the first usable work moment at or after it. */
  const usableStart = (axis: number): { dayIndex: number; minutes: number } | null => {
    for (const day of days) {
      const base = day.index * AXIS
      for (const segment of day.segments) {
        const segEnd = base + segment.end
        if (axis < segEnd) return { dayIndex: day.index, minutes: Math.max(axis, base + segment.start) - base }
      }
    }
    return null
  }

  interface Placement {
    pieces: DayPiece[]
    machine: Machine | null
    crew: PlannerWorker[]
  }

  interface StepCtx {
    order: PlannerOrder
    step: ProcessNode
    minutes: number
    crewSize: number
  }

  const tryCandidate = (ctx: StepCtx, axis: number): Placement | null => {
    const begin = usableStart(axis)
    if (!begin) return null
    const pieces = layout(ctx.minutes, begin.dayIndex, begin.minutes)
    if (!pieces) return null
    const free = (key: string): boolean =>
      pieces.every((piece) => !overlaps(busy.get(key), piece.day.index * AXIS + piece.start, piece.day.index * AXIS + piece.end))
    const present = (worker: PlannerWorker): boolean => pieces.every((piece) => worker.presence[piece.day.date] !== false)
    const typeId = ctx.step.machineTypeId
    const machines = typeId ? [...(machinesByType.get(typeId) ?? [])] : [null]
    if (typeId) {
      machines.sort(
        (a, b) =>
          (planned.get(`m:${a?.id}`) ?? 0) - (planned.get(`m:${b?.id}`) ?? 0) ||
          (a?.name ?? '').localeCompare(b?.name ?? '', 'sr'),
      )
    }
    const people = input.workers.filter((worker) => present(worker) && free(`u:${worker.userId}`)).sort(workerOrder)
    for (const machine of machines) {
      if (machine && !free(`m:${machine.id}`)) continue
      const leads = typeId ? people.filter((worker) => worker.machineTypeIds.includes(typeId)) : people
      const lead = leads[0]
      if (!lead) continue
      const helpers = people.filter((worker) => worker.userId !== lead.userId).slice(0, ctx.crewSize - 1)
      if (helpers.length < ctx.crewSize - 1) continue
      return { pieces, machine, crew: [lead, ...helpers] }
    }
    return null
  }

  const place = (ctx: StepCtx, earliest: number, locked: boolean): number | null => {
    const { order, step } = ctx
    const typeId = step.machineTypeId
    if (typeId && !typeIds.has(typeId)) {
      flag('unknown_machine_type', order, step)
      return null
    }
    if (typeId && (machinesByType.get(typeId) ?? []).length === 0) {
      flag('no_machine', order, step)
      return null
    }
    const qualified = typeId ? input.workers.filter((worker) => worker.machineTypeIds.includes(typeId)) : input.workers
    if (qualified.length === 0 || input.workers.length < ctx.crewSize) {
      flag('no_workers', order, step)
      return null
    }

    // Candidate start times: the earliest moment, the start of every later
    // segment, and the end of every busy interval of a resource that could be used.
    const candidates = new Set<number>([earliest])
    for (const day of days) {
      for (const segment of day.segments) candidates.add(day.index * AXIS + segment.start)
    }
    for (const list of busy.values()) for (const interval of list) candidates.add(interval.end)
    const sorted = [...candidates].filter((axis) => axis >= earliest).sort((a, b) => a - b)

    for (const axis of sorted) {
      const begin = usableStart(axis)
      if (!begin) break
      const placement = tryCandidate(ctx, axis)
      if (!placement) continue
      const parts = placement.pieces.length
      let lastEnd = 0
      placement.pieces.forEach((piece, i) => {
        const base = piece.day.index * AXIS
        const keys = [...placement.crew.map((worker) => `u:${worker.userId}`)]
        if (placement.machine) keys.push(`m:${placement.machine.id}`)
        for (const key of keys) addBusy(key, base + piece.start, base + piece.end)
        assignments.push({
          id: `${order.id}:${step.id}:${i + 1}`,
          workOrderId: order.id,
          orderNumber: order.number,
          clientName: order.clientName,
          stepNodeId: step.id,
          stepLabel: step.label,
          machineId: placement.machine?.id ?? null,
          machineName: placement.machine?.name ?? '',
          leadUserId: placement.crew[0].userId,
          userIds: placement.crew.map((worker) => worker.userId),
          start: stamp(piece.day.date, piece.start),
          end: stamp(piece.day.date, piece.end),
          minutes: piece.minutes,
          part: i + 1,
          parts,
          locked,
        })
        lastBlock.set(order.id, piece.day.date)
        lastEnd = base + piece.end
      })
      return lastEnd
    }
    flag('no_capacity', order, step)
    return null
  }

  // Zero-minute steps take no capacity: they sit at the earliest usable moment.
  const placeZero = (ctx: StepCtx, earliest: number): number | null => {
    const begin = usableStart(earliest)
    if (!begin) {
      flag('no_capacity', ctx.order, ctx.step)
      return null
    }
    const day = days[begin.dayIndex]
    const typeId = ctx.step.machineTypeId
    if (typeId && !typeIds.has(typeId)) {
      flag('unknown_machine_type', ctx.order, ctx.step)
      return null
    }
    const machine = typeId ? ([...(machinesByType.get(typeId) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'sr'))[0] ?? null) : null
    if (typeId && !machine) {
      flag('no_machine', ctx.order, ctx.step)
      return null
    }
    const lead = [...input.workers]
      .filter((worker) => !typeId || worker.machineTypeIds.includes(typeId))
      .sort(workerOrder)[0]
    if (!lead) {
      flag('no_workers', ctx.order, ctx.step)
      return null
    }
    assignments.push({
      id: `${ctx.order.id}:${ctx.step.id}:1`,
      workOrderId: ctx.order.id,
      orderNumber: ctx.order.number,
      clientName: ctx.order.clientName,
      stepNodeId: ctx.step.id,
      stepLabel: ctx.step.label,
      machineId: machine?.id ?? null,
      machineName: machine?.name ?? '',
      leadUserId: lead.userId,
      userIds: [lead.userId],
      start: stamp(day.date, begin.minutes),
      end: stamp(day.date, begin.minutes),
      minutes: 0,
      part: 1,
      parts: 1,
      locked: false,
    })
    lastBlock.set(ctx.order.id, day.date)
    return day.index * AXIS + begin.minutes
  }

  // Pinned blocks: kept as they are; their resources are busy.
  const pinnedSteps = new Set<string>()
  const pinnedFinish = new Map<string, number>()
  for (const block of input.pinned ?? []) {
    const from = splitStamp(block.start)
    const to = splitStamp(block.end)
    const day = dayByDate.get(from.date)
    if (!day) {
      // A block before the horizon (an earlier day's published work, D-028):
      // its step counts as finished by the start; nothing is booked or echoed.
      if (days[0] && from.date < days[0].date) {
        const stepKey = `${block.workOrderId}:${block.stepNodeId}`
        pinnedSteps.add(stepKey)
        pinnedFinish.set(stepKey, pinnedFinish.get(stepKey) ?? 0)
      }
      continue
    }
    const base = day.index * AXIS
    for (const key of [...block.userIds.map((id) => `u:${id}`), ...(block.machineId ? [`m:${block.machineId}`] : [])]) {
      addBusy(key, base + from.minutes, base + to.minutes)
    }
    // Kept as it is, but a downtime of its machine is an issue the admin must resolve.
    const down = downtimeHit(downtimes, block.machineId, block.start, block.end)
    if (down) {
      issues.push({
        code: 'machine_down',
        workOrderId: block.workOrderId,
        orderNumber: block.orderNumber,
        stepNodeId: block.stepNodeId,
        stepLabel: block.stepLabel,
        message: `Radni nalog ${block.orderNumber}, korak „${block.stepLabel}“: mašina „${block.machineName}“ je van pogona ${humanStamp(down.from)} – ${humanStamp(down.to)}, a zaključani blok je planiran u tom periodu.`,
      })
    }
    assignments.push({ ...block })
    const stepKey = `${block.workOrderId}:${block.stepNodeId}`
    pinnedSteps.add(stepKey)
    pinnedFinish.set(stepKey, Math.max(pinnedFinish.get(stepKey) ?? 0, base + to.minutes))
    lastBlock.set(block.workOrderId, to.date)
  }
  for (const [key, value] of pinnedFinish) finish.set(key, value)

  // ---- order bookkeeping
  interface Pending {
    order: PlannerOrder
    step: ProcessNode
    key: string
    tail: number
    preds: ProcessNode[]
  }
  const pending: Pending[] = []
  const inProgress: Pending[] = []
  for (const order of input.orders) {
    const stepMinutes = new Map<string, number>()
    const steps = order.graph.nodes.filter((node) => node.kind === 'step')
    for (const step of steps) stepMinutes.set(step.id, stepDurationMinutes(step, order.quantity))
    // Longest remaining chain of work starting at each open step.
    const successors = new Map<string, string[]>()
    for (const step of steps) {
      for (const pred of predecessorSteps(order.graph, step.id)) {
        const list = successors.get(pred.id) ?? []
        list.push(step.id)
        successors.set(pred.id, list)
      }
    }
    const tailMemo = new Map<string, number>()
    const tailOf = (id: string): number => {
      const known = tailMemo.get(id)
      if (known !== undefined) return known
      tailMemo.set(id, 0)
      let longest = 0
      for (const next of successors.get(id) ?? []) longest = Math.max(longest, tailOf(next))
      const own = ['done', 'skipped'].includes(stepStatus(steps.find((s) => s.id === id) as ProcessNode)) ? 0 : (stepMinutes.get(id) ?? 0)
      const value = own + longest
      tailMemo.set(id, value)
      return value
    }
    for (const step of steps) {
      const status = stepStatus(step)
      if (status === 'done' || status === 'skipped') continue
      const key = `${order.id}:${step.id}`
      if (pinnedSteps.has(key)) continue
      const item: Pending = { order, step, key, tail: tailOf(step.id), preds: predecessorSteps(order.graph, step.id) }
      if (status === 'in_progress') inProgress.push(item)
      else pending.push(item)
    }
  }

  const toCtx = (item: Pending): StepCtx => ({
    order: item.order,
    step: item.step,
    minutes: stepDurationMinutes(item.step, item.order.quantity),
    crewSize: stepCrew(item.step),
  })

  const run = (item: Pending, earliest: number, locked: boolean): void => {
    const ctx = toCtx(item)
    if (!hasTimes(item.step)) flag('missing_duration', item.order, item.step)
    const end = ctx.minutes === 0 ? placeZero(ctx, earliest) : place(ctx, earliest, locked)
    if (end !== null) finish.set(item.key, end)
  }

  // In-progress steps first, at Start, locked.
  for (const item of [...inProgress].sort(compareOrders)) run(item, startAxis, true)

  // Everything else: most urgent ready step first.
  const remaining = new Set(pending.map((item) => item.key))
  const failed = new Set<string>()
  const isFinished = (pred: ProcessNode): boolean => {
    const status = stepStatus(pred)
    return status === 'done' || status === 'skipped'
  }
  const earliestOf = (item: Pending): number | null => {
    let earliest = startAxis
    for (const pred of item.preds) {
      if (isFinished(pred)) continue
      const key = `${item.order.id}:${pred.id}`
      const end = finish.get(key)
      if (end === undefined) return null
      earliest = Math.max(earliest, afterLag(end))
    }
    return earliest
  }
  const slackOf = (item: Pending, earliest: number): number => {
    const due = item.order.dueDate ? axisOfDate(item.order.dueDate) : Number.MAX_SAFE_INTEGER / 2
    return due - (earliest + item.tail)
  }

  while (remaining.size > 0) {
    let best: { item: Pending; earliest: number; slack: number } | null = null
    let blocked = true
    for (const item of pending) {
      if (!remaining.has(item.key)) continue
      if (item.preds.some((pred) => failed.has(`${item.order.id}:${pred.id}`))) continue
      const earliest = earliestOf(item)
      if (earliest === null) continue
      blocked = false
      const slack = slackOf(item, earliest)
      if (!best || compareCandidates({ item, slack }, best) < 0) best = { item, earliest, slack }
    }
    if (!best || blocked) break
    remaining.delete(best.item.key)
    const before = finish.size
    run(best.item, best.earliest, false)
    if (finish.size === before) failed.add(best.item.key)
  }

  assignments.sort(
    (a, b) =>
      a.start.localeCompare(b.start) || a.machineName.localeCompare(b.machineName, 'sr') || a.orderNumber.localeCompare(b.orderNumber, 'sr', { numeric: true }),
  )

  // ---- forecast
  const fallbackDate = start?.date ?? input.date
  const forecast: OrderForecast[] = input.orders.map((order) => {
    const codes = orderIssues.get(order.id)
    const blocking = codes ? [...codes].some((code) => code !== 'missing_duration') : false
    const unfinished = pending.some((item) => item.order.id === order.id && !finish.has(item.key))
    const unplannable = blocking || unfinished
    const estimated = unplannable ? null : (lastBlock.get(order.id) ?? fallbackDate)
    return {
      workOrderId: order.id,
      orderNumber: order.number,
      clientName: order.clientName,
      dueDate: order.dueDate,
      priority: order.priority,
      estimatedFinish: estimated,
      late: estimated !== null && order.dueDate !== null && estimated > order.dueDate,
      unplannable,
    }
  })
  forecast.sort((a, b) => {
    if (a.unplannable !== b.unplannable) return a.unplannable ? 1 : -1
    return (a.estimatedFinish ?? '').localeCompare(b.estimatedFinish ?? '') || a.orderNumber.localeCompare(b.orderNumber, 'sr', { numeric: true })
  })

  return { assignments, issues, forecast }

  function compareOrders(a: Pending, b: Pending): number {
    return (
      a.order.createdAt.localeCompare(b.order.createdAt) ||
      a.order.number.localeCompare(b.order.number, 'sr', { numeric: true }) ||
      a.step.id.localeCompare(b.step.id)
    )
  }

  function compareCandidates(a: { item: Pending; slack: number }, b: { item: Pending; slack: number }): number {
    if (a.slack !== b.slack) return a.slack - b.slack
    const rank = (PRIORITY_RANK[a.item.order.priority] ?? 2) - (PRIORITY_RANK[b.item.order.priority] ?? 2)
    return rank || compareOrders(a.item, b.item)
  }
}

// ---- draft conflicts --------------------------------------------------------

/** Conflicts in hand-edited blocks of one day (a simplified `planner.CheckDraft`). */
export function checkDraft(
  input: Pick<PlannerInput, 'hours' | 'date' | 'machineTypes' | 'machines' | 'workers' | 'orders' | 'downtimes'>,
  assignments: PlanAssignment[],
): PlanIssue[] {
  const issues: PlanIssue[] = []
  const day = shiftOn(input.hours, input.date)
  const segments = day ? shiftSegments(day) : []
  const downtimes = downtimesByMachine(input.downtimes)
  const lag = transferMinutesOf(input.hours)
  // The inter-operation time after an upstream end, within the day (a lag that
  // does not elapse before the shift ends blocks every later start that day).
  const afterLag = (minutes: number): number => afterWorkingMinutes(segments, minutes, lag, Number.POSITIVE_INFINITY)
  const machines = new Map(input.machines.map((machine) => [machine.id, machine]))
  const workers = new Map(input.workers.map((worker) => [worker.userId, worker]))
  const orders = new Map(input.orders.map((order) => [order.id, order]))
  const conflict = (a: PlanAssignment, text: string): void => {
    issues.push({
      code: 'conflict',
      workOrderId: a.workOrderId,
      orderNumber: a.orderNumber,
      stepNodeId: a.stepNodeId,
      stepLabel: a.stepLabel,
      message: `Radni nalog ${a.orderNumber}, korak „${a.stepLabel}“: ${text}`,
    })
  }
  const times = (a: PlanAssignment): Interval => ({ start: splitStamp(a.start).minutes, end: splitStamp(a.end).minutes })
  for (const a of assignments) {
    const { start, end } = times(a)
    if (a.minutes > 0 && !segments.some((segment) => start >= segment.start && end <= segment.end)) {
      conflict(a, 'blok je van radnog vremena ili preklapa pauzu.')
    }
    const machine = a.machineId ? machines.get(a.machineId) : undefined
    const order = orders.get(a.workOrderId)
    const step = order?.graph.nodes.find((node) => node.id === a.stepNodeId)
    if (a.machineId && (!machine || !machine.inService)) conflict(a, 'mašina nije u upotrebi.')
    const down = downtimeHit(downtimes, a.machineId, a.start, a.end)
    if (machine && down) conflict(a, `mašina „${machine.name}“ je van pogona ${humanStamp(down.from)} – ${humanStamp(down.to)}.`)
    if (machine && step?.machineTypeId && machine.machineTypeId !== step.machineTypeId) conflict(a, 'mašina je pogrešnog tipa.')
    if (step && a.userIds.length < stepCrew(step)) conflict(a, 'ekipa je manja od potrebne.')
    const lead = workers.get(a.leadUserId)
    if (machine && lead && !lead.machineTypeIds.includes(machine.machineTypeId)) {
      conflict(a, 'vođa nije osposobljen za mašinu.')
    }
    if (order && step) {
      for (const pred of predecessorSteps(order.graph, step.id)) {
        const upstream = assignments.filter((other) => other.workOrderId === a.workOrderId && other.stepNodeId === pred.id)
        if (upstream.some((other) => other.end > a.start)) {
          conflict(a, 'počinje pre završetka prethodnog koraka.')
        } else if (upstream.some((other) => afterLag(splitStamp(other.end).minutes) > start)) {
          conflict(a, `počinje pre isteka međuoperacijskog vremena (${lag} min).`)
        }
      }
    }
  }
  const sorted = [...assignments].sort((x, y) => x.start.localeCompare(y.start))
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (b.start >= a.end) break
      if (a.minutes === 0 || b.minutes === 0) continue
      if (a.machineId && a.machineId === b.machineId) conflict(b, `mašina „${b.machineName}“ je već zauzeta.`)
      const shared = b.userIds.find((id) => a.userIds.includes(id))
      if (shared) conflict(b, `${workers.get(shared)?.username ?? 'radnik'} je već zauzet.`)
    }
  })
  return issues
}

// ---- drift ------------------------------------------------------------------

/**
 * Suggests a re-plan when today's published plan no longer matches the orders
 * (see `planner.Drift`), or a block of an unfinished step lies in a downtime
 * window of its machine (D-028).
 */
export function computeDrift(
  plan: ProductionPlan,
  orders: PlannerOrder[],
  now: LocalMoment,
  downtimes: readonly MachineDowntime[] = [],
): PlanDrift {
  const reasons: string[] = []
  const byMachine = downtimesByMachine(downtimes)
  const statusOf = (workOrderId: string, stepNodeId: string): string | null => {
    const step = orders.find((order) => order.id === workOrderId)?.graph.nodes.find((node) => node.id === stepNodeId)
    return step ? stepStatus(step) : null
  }
  for (const block of plan.assignments) {
    const status = statusOf(block.workOrderId, block.stepNodeId)
    if (!status) continue
    const from = splitStamp(block.start)
    const to = splitStamp(block.end)
    const startedLate = from.date < now.date || (from.date === now.date && from.minutes + 15 < now.minutes)
    const ended = to.date < now.date || (to.date === now.date && to.minutes < now.minutes)
    if (startedLate && status === 'pending') {
      reasons.push(`Korak „${block.stepLabel}“ (nalog ${block.orderNumber}) je trebalo da počne u ${clock(from.minutes)}.`)
    } else if (ended && status !== 'done' && status !== 'skipped') {
      reasons.push(`Korak „${block.stepLabel}“ (nalog ${block.orderNumber}) nije završen u planiranom roku.`)
    }
    if (status === 'done' || status === 'skipped') continue
    const down = downtimeHit(byMachine, block.machineId, block.start, block.end)
    if (down) {
      reasons.push(
        `Korak „${block.stepLabel}“ (nalog ${block.orderNumber}): mašina „${block.machineName}“ je van pogona ${humanStamp(down.from)} – ${humanStamp(down.to)}.`,
      )
    }
  }
  for (const order of orders) {
    for (const step of order.graph.nodes) {
      if (step.kind !== 'step' || stepStatus(step) !== 'in_progress') continue
      const covered = plan.assignments.some((block) => {
        if (block.workOrderId !== order.id || block.stepNodeId !== step.id) return false
        const from = splitStamp(block.start)
        const to = splitStamp(block.end)
        return from.date === now.date && from.minutes <= now.minutes && now.minutes <= to.minutes
      })
      if (!covered) reasons.push(`Korak „${step.label}“ (nalog ${order.number}) je u toku van plana.`)
    }
  }
  return { suggested: reasons.length > 0, reasons }
}
