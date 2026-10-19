// Workstation load ("Zauzetost", D-028) for fixture mode: a pure TS twin of
// `iris-api/internal/planner/load.go` (LoadBlocks + Load). Keep the rules in
// sync; the Go service stays authoritative.

import { addDays, parseClock, workingDays } from '@/lib/planning/fixture-planner'
import type {
  LoadSource,
  Machine,
  MachineDowntime,
  MachineType,
  PlanAssignment,
  ProductionPlan,
  WorkingHours,
  WorkstationLoad,
  WorkstationLoadBlock,
  WorkstationLoadDay,
  WorkstationLoadTotal,
  WorkstationLoadType,
} from '@/types/planning'

/** Name of the pseudo machine type (id "") for steps without a machine. */
export const LOAD_NO_MACHINE_TYPE_NAME = 'Bez mašine'
/** Longest range of `GET /planning/load` (inclusive). */
export const MAX_LOAD_DAYS = 31

/** User-facing messages of `GET /planning/load` (mirroring the API). */
export const LOAD_MESSAGES = {
  badPlan: 'Parametar „plan“ može biti samo „draft“.',
  rangeOrder: 'Datum „do“ ne može biti pre datuma „od“.',
  rangeTooLong: `Opseg može imati najviše ${MAX_LOAD_DAYS} dana.`,
  draftToday: 'Nacrt plana može da se prikaže samo kad opseg počinje danas.',
}

/** The default end of a load range: the kept horizon of the plan that speaks for `from`, capped at `last`. */
export function defaultLoadTo(plans: readonly ProductionPlan[], from: string, last: string): string {
  let best: ProductionPlan | undefined
  for (const plan of plans) {
    if (plan.date > from || (plan.date < from && (plan.horizonEnd || plan.date) < from)) continue
    if (!best || plan.date > best.date) best = plan
  }
  const end = best && best.horizonEnd > from ? best.horizonEnd : from
  return end > last ? last : end
}

const blockDate = (block: PlanAssignment): string => block.start.slice(0, 10)
const byStart = (a: PlanAssignment, b: PlanAssignment): number => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)
const byName = (a: string, b: string): number => {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (la !== lb) return la < lb ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The blocks of from..to: for each date the plan dated that day, else the most
 * recent earlier plan whose kept horizon covers it; only blocks starting on the date.
 */
export function loadBlocks(plans: readonly ProductionPlan[], from: string, to: string): PlanAssignment[] {
  const sorted = [...plans].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const out: PlanAssignment[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    let source: ProductionPlan | undefined
    for (const plan of sorted) {
      if (plan.date > date) break
      const horizonEnd = plan.horizonEnd || plan.date
      if (plan.date === date || horizonEnd >= date) source = plan
    }
    if (!source) continue
    out.push(...source.assignments.filter((block) => blockDate(block) === date))
  }
  return out.sort(byStart)
}

export interface LoadInput {
  hours: WorkingHours
  from: string
  to: string
  machineTypes: readonly MachineType[]
  machines: readonly Machine[]
  downtimes: readonly MachineDowntime[]
  /** A date missing from `presence` counts as present. */
  workers: readonly { userId: string; username: string; presence: Record<string, boolean> }[]
  blocks: readonly PlanAssignment[]
  source?: LoadSource
}

interface Segment {
  start: number
  end: number
}

/** The working segments (minutes of the day) of a date; empty on a day off. */
function segmentsOn(hours: WorkingHours, date: string): Segment[] | null {
  const [day] = workingDays(hours, date, 1)
  return day && day.date === date ? day.segments : null
}

/** Minutes of [segment] covered by the windows (overlaps counted once). */
function busyMinutes(windows: readonly MachineDowntime[], date: string, segment: Segment): number {
  const spans = windows
    .map((window) => {
      const fromDate = window.from.slice(0, 10)
      const toDate = window.to.slice(0, 10)
      if (toDate < date || fromDate > date) return null
      const start = fromDate < date ? 0 : parseClock(window.from.slice(11))
      const end = toDate > date ? 24 * 60 : parseClock(window.to.slice(11))
      return { start: Math.max(start, segment.start), end: Math.min(end, segment.end) }
    })
    .filter((span): span is Segment => span !== null && span.end > span.start)
    .sort((a, b) => a.start - b.start)
  let total = 0
  let cursor = segment.start
  for (const span of spans) {
    const start = Math.max(span.start, cursor)
    if (span.end > start) {
      total += span.end - start
      cursor = span.end
    }
  }
  return total
}

class Row {
  planned = new Map<string, number>()
  blocks = new Map<string, WorkstationLoadBlock[]>()

  add(date: string, block: PlanAssignment): void {
    this.planned.set(date, (this.planned.get(date) ?? 0) + block.minutes)
    const list = this.blocks.get(date) ?? []
    list.push({
      workOrderId: block.workOrderId,
      orderNumber: block.orderNumber,
      stepNodeId: block.stepNodeId,
      stepLabel: block.stepLabel,
      machineName: block.machineName,
      start: block.start,
      end: block.end,
      minutes: block.minutes,
      ...(block.leadUserId ? { leadUserId: block.leadUserId } : {}),
    })
    this.blocks.set(date, list)
  }

  days(dates: readonly string[], available: (date: string) => number): WorkstationLoadDay[] {
    return dates.map((date) => ({
      date,
      plannedMinutes: this.planned.get(date) ?? 0,
      availableMinutes: available(date),
      blocks: this.blocks.get(date) ?? [],
    }))
  }
}

/** Planned against available minutes per machine type, unit and person (see `load.go`). */
export function computeLoad(input: LoadInput): WorkstationLoad {
  const byDate = new Map<string, PlanAssignment[]>()
  for (const block of input.blocks) {
    const date = blockDate(block)
    if (date < input.from || date > input.to) continue
    byDate.set(date, [...(byDate.get(date) ?? []), block])
  }
  const days: string[] = []
  const segments = new Map<string, Segment[]>()
  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const daySegments = segmentsOn(input.hours, date)
    if (!daySegments && !byDate.has(date)) continue
    days.push(date)
    segments.set(date, daySegments ?? [])
  }
  const shiftMinutes = (date: string): number =>
    (segments.get(date) ?? []).reduce((sum, segment) => sum + segment.end - segment.start, 0)
  const windows = new Map<string, MachineDowntime[]>()
  for (const downtime of input.downtimes) {
    if (downtime.from >= downtime.to) continue
    windows.set(downtime.machineId, [...(windows.get(downtime.machineId) ?? []), downtime])
  }

  const knownTypes = new Set(input.machineTypes.map((type) => type.id))
  const units = new Map<string, { unit: Machine; row: Row }>()
  const addUnit = (machine: Machine) => {
    const entry = { unit: machine, row: new Row() }
    units.set(machine.id, entry)
    return entry
  }
  for (const machine of input.machines) {
    addUnit(knownTypes.has(machine.machineTypeId) ? machine : { ...machine, machineTypeId: '' })
  }
  const people = new Map(input.workers.map((worker) => [worker.userId, new Row()]))
  for (const date of days) {
    for (const block of [...(byDate.get(date) ?? [])].sort(byStart)) {
      const machineId = block.machineId ?? ''
      const entry =
        units.get(machineId) ??
        addUnit({
          id: machineId,
          machineTypeId: '',
          name: machineId === '' ? LOAD_NO_MACHINE_TYPE_NAME : block.machineName,
          inService: machineId === '',
          createdAt: '',
          updatedAt: '',
        })
      entry.row.add(date, block)
      const counted = new Set<string>()
      for (const userId of [block.leadUserId, ...block.userIds]) {
        const row = people.get(userId)
        if (row && !counted.has(userId)) {
          counted.add(userId)
          row.add(date, block)
        }
      }
    }
  }

  const types = [...input.machineTypes].sort((a, b) => byName(a.name, b.name) || byName(a.id, b.id))
  if ([...units.values()].some((entry) => entry.unit.machineTypeId === '')) {
    types.push({ id: '', name: LOAD_NO_MACHINE_TYPE_NAME, createdAt: '', updatedAt: '' })
  }
  const machineTypes: WorkstationLoadType[] = types.map((type) => {
    const members = [...units.values()]
      .filter((entry) => entry.unit.machineTypeId === type.id)
      .sort((a, b) => byName(a.unit.name, b.unit.name) || byName(a.unit.id, b.unit.id))
    const totals: WorkstationLoadTotal[] = days.map((date) => ({ date, plannedMinutes: 0, availableMinutes: 0 }))
    const typeUnits = members.map(({ unit, row }) => {
      const available = (date: string): number => {
        if (!unit.inService || unit.id === '') return 0
        return (segments.get(date) ?? []).reduce(
          (sum, segment) => sum + segment.end - segment.start - busyMinutes(windows.get(unit.id) ?? [], date, segment),
          0,
        )
      }
      const unitDays = row.days(days, available)
      unitDays.forEach((day, index) => {
        totals[index].plannedMinutes += day.plannedMinutes
        totals[index].availableMinutes += day.availableMinutes
      })
      return { id: unit.id, name: unit.name, inService: unit.inService, days: unitDays }
    })
    return { id: type.id, name: type.name, units: typeUnits, days: totals }
  })

  const workers = [...input.workers].sort((a, b) => byName(a.username, b.username) || byName(a.userId, b.userId))
  return {
    from: input.from,
    to: input.to,
    source: input.source ?? 'published',
    days,
    machineTypes,
    people: workers.map((worker) => ({
      userId: worker.userId,
      username: worker.username,
      days: (people.get(worker.userId) ?? new Row()).days(days, (date) =>
        worker.presence[date] === false ? 0 : shiftMinutes(date),
      ),
    })),
  }
}
