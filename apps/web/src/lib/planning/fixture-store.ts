import { ApiError } from '@/lib/errors'
import { ATTENDANCE_DISABLED_MESSAGE, PLANNING_DISABLED_MESSAGE } from '@/lib/modules'
import { STOCK_DISABLED_MESSAGE } from '@/lib/modules'
import { buildMaterialNeeds, defaultMaterialNeedsEnd, materialWeeks } from '@/lib/planning/material-needs'
import {
  addDays,
  checkDraft,
  computeDrift,
  localMoment,
  parseClock,
  planDay,
  workingDays,
  type LocalMoment,
  type PlannerOrder,
  type PlannerWorker,
} from '@/lib/planning/fixture-planner'
import { LOAD_MESSAGES, MAX_LOAD_DAYS, computeLoad, defaultLoadTo, loadBlocks } from '@/lib/planning/fixture-load'
import { stepStatus } from '@/lib/process/graph'
import type { ProcessGraph } from '@/types/process'
import type { OrganizationModules } from '@/types/settings'
import {
  MAX_MACHINE_NAME_LENGTH,
  MAX_MACHINE_NOTE_LENGTH,
  MAX_TRANSFER_MINUTES,
  MAX_WORKING_HOURS_EXCEPTIONS,
  PLANNING_FORECAST_DAYS,
  type AttendanceEntry,
  type Machine,
  type MachineDowntime,
  type MachineType,
  type MyQueue,
  type OrderForecast,
  type PlanAssignment,
  type PlanDay,
  type PlanDayHorizon,
  type PlanHorizon,
  type ProductionPlan,
  type WorkerQualifications,
  type WorkingHours,
} from '@/types/planning'
import { DEFAULT_MATERIAL_NEEDS_DAYS } from '@/types/planning'
import type { StockLevel } from '@/types/stock'

// In-memory Planiranje store for fixture mode. It mirrors the API's validation,
// permissions and module gate closely enough for demos and UI development; the
// Go service stays authoritative. The plan comes from `fixture-planner.ts`.
//
// Like the API (D-028), a plan keeps every block of its run over the whole
// horizon; the plan endpoints show the plan date's blocks only and
// `getPlanHorizon` the rest, grouped by day.

const MESSAGES = {
  adminOnly: 'Potrebna je administratorska uloga.',
  loginRequired: 'Prijava je obavezna.',
  typeNameRequired: 'Naziv tipa mašine je obavezan.',
  typeNameTooLong: `Naziv tipa mašine može imati najviše ${MAX_MACHINE_NAME_LENGTH} znakova.`,
  typeDuplicate: 'Tip mašine sa tim nazivom već postoji.',
  typeMissing: 'Tip mašine nije pronađen.',
  typeInUse: 'Tip mašine se koristi za mašine.',
  machineNameRequired: 'Naziv mašine je obavezan.',
  machineNameTooLong: `Naziv mašine može imati najviše ${MAX_MACHINE_NAME_LENGTH} znakova.`,
  machineNoteTooLong: `Napomena može imati najviše ${MAX_MACHINE_NOTE_LENGTH} znakova.`,
  machineDuplicate: 'Mašina sa tim nazivom već postoji.',
  machineMissing: 'Mašina nije pronađena.',
  userMissing: 'Korisnik nije pronađen.',
  badDate: 'Datum mora biti u formatu GGGG-MM-DD.',
  pastDate: 'Plan se ne može praviti za datum u prošlosti.',
  replanToday: 'Preplaniranje je moguće samo za današnji dan.',
  tooManyAssignments: 'Plan može imati najviše 2000 blokova.',
  noDraft: 'Nacrt plana za taj datum ne postoji.',
  badHours: 'Radno vreme nije ispravno.',
  badTransfer: `Međuoperacijsko vreme mora biti između 0 i ${MAX_TRANSFER_MINUTES} minuta.`,
  tooManyExceptions: `Izuzetaka može biti najviše ${MAX_WORKING_HOURS_EXCEPTIONS}.`,
  downtimeTime: 'Početak i kraj zastoja moraju biti u obliku GGGG-MM-DDTHH:MM.',
  downtimeOrder: 'Početak zastoja mora biti pre njegovog kraja.',
  downtimeNoteTooLong: 'Napomena zastoja je predugačka (najviše 500 znakova).',
  downtimeMissing: 'Zastoj mašine nije pronađen.',
  materialsOrder: 'Kraj perioda ne može biti pre početka.',
  materialsSpan: 'Period može obuhvatiti najviše 8 nedelja.',
}

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'invoiced'])
const MAX_ASSIGNMENTS = 2000
/** Issue codes that mean a step was left out of the plan, whatever day it would fall on. */
const UNPLACEABLE_ISSUES = new Set(['unknown_machine_type', 'no_machine', 'no_workers', 'no_capacity'])
const PLAN_DATE_MAX = '9999-12-31'

function fixtureError(status: number, message: string): ApiError {
  return new ApiError(message, { status, url: 'fixture://planning', method: 'FIXTURE' })
}

/** A work order as the fixture planner needs it. */
export interface PlanningOrderSource {
  id: string
  orderNumber: string
  clientName: string
  dueDate: string | null
  priority: string
  status: string
  quantity: number | null
  createdAt: string
}

export interface PlanningFixtureContext {
  currentUser: () => { id: string; username: string; role: 'admin' | 'user' } | null
  users: () => { id: string; username: string }[]
  modules: () => OrganizationModules
  orders: () => PlanningOrderSource[]
  /** Every order's process graph (with its planned-quantity factor, default 1). */
  processes: () => { workOrderId: string; graph: ProcessGraph; factor?: number }[]
  /** Injected clock for tests. */
  now?: () => Date
  /** Stock levels for the material-needs report (D-028); none without it. */
  stockLevels?: () => Promise<StockLevel[]>
}

type PlanningApi = Pick<
  Window['api'],
  | 'listMachineTypes'
  | 'createMachineType'
  | 'updateMachineType'
  | 'deleteMachineType'
  | 'listMachines'
  | 'createMachine'
  | 'updateMachine'
  | 'deleteMachine'
  | 'listMachineDowntimes'
  | 'createMachineDowntime'
  | 'deleteMachineDowntime'
  | 'listQualifications'
  | 'setQualifications'
  | 'listAttendance'
  | 'setAttendance'
  | 'getWorkingHours'
  | 'setWorkingHours'
  | 'getPlanDay'
  | 'getPlanHorizon'
  | 'generatePlan'
  | 'updatePlanDraft'
  | 'deletePlanDraft'
  | 'publishPlan'
  | 'getMyQueue'
  | 'getPlanningForecast'
  | 'getMaterialNeeds'
  | 'getPlanningLoad'
>

export interface PlanningFixtureStore {
  api: PlanningApi
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start: '07:00',
    end: '15:00',
    breaks: [{ start: '11:00', end: '11:30' }],
  })),
  transferMinutes: 0,
  exceptions: [],
}

/** Seed machine types; ids match the planning fields of the seeded process template. */
const SEED_TYPES: [string, string][] = [
  ['mt-ctp', 'CTP (ploče)'],
  ['mt-offset', 'Offset štampa'],
  ['mt-digital', 'Digitalna štampa'],
  ['mt-cutter', 'Sečenje'],
  ['mt-fold', 'Savijanje'],
]
const SEED_MACHINES: [string, string, string][] = [
  ['mc-ctp', 'mt-ctp', 'CTP uređaj'],
  ['mc-offset-1', 'mt-offset', 'Heidelberg SM 74'],
  ['mc-offset-2', 'mt-offset', 'Heidelberg GTO 52'],
  ['mc-digital', 'mt-digital', 'Konica Minolta C14000'],
  ['mc-cutter', 'mt-cutter', 'Polar giljotina'],
  ['mc-fold', 'mt-fold', 'Stahl falcer'],
]

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

function validLocal(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value) && validDate(value.slice(0, 10))
}

function validClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function hoursProblem(hours: WorkingHours): string | null {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: hours.timeZone })
  } catch {
    return MESSAGES.badHours
  }
  if (!Number.isInteger(hours.transferMinutes) || hours.transferMinutes < 0 || hours.transferMinutes > MAX_TRANSFER_MINUTES) {
    return MESSAGES.badTransfer
  }
  const shiftProblem = (start: string, end: string, shiftBreaks: { start: string; end: string }[]): string | null => {
    if (!validClock(start) || !validClock(end) || parseClock(start) >= parseClock(end)) return MESSAGES.badHours
    let previousEnd = parseClock(start)
    const breaks = [...shiftBreaks].sort((a, b) => a.start.localeCompare(b.start))
    for (const gap of breaks) {
      if (!validClock(gap.start) || !validClock(gap.end)) return MESSAGES.badHours
      if (parseClock(gap.start) < previousEnd || parseClock(gap.start) >= parseClock(gap.end)) return MESSAGES.badHours
      if (parseClock(gap.end) > parseClock(end)) return MESSAGES.badHours
      previousEnd = parseClock(gap.end)
    }
    return null
  }
  const seen = new Set<number>()
  for (const day of hours.days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7 || seen.has(day.weekday)) {
      return MESSAGES.badHours
    }
    seen.add(day.weekday)
    const problem = shiftProblem(day.start, day.end, day.breaks)
    if (problem) return problem
  }
  const exceptions = hours.exceptions ?? []
  if (exceptions.length > MAX_WORKING_HOURS_EXCEPTIONS) return MESSAGES.tooManyExceptions
  const dates = new Set<string>()
  for (const exception of exceptions) {
    if (!validDate(exception.date) || dates.has(exception.date)) return MESSAGES.badHours
    dates.add(exception.date)
    if (exception.off) continue
    const problem = shiftProblem(exception.start ?? '', exception.end ?? '', exception.breaks ?? [])
    if (problem) return problem
  }
  return null
}

export function createPlanningFixtureStore(context: PlanningFixtureContext): PlanningFixtureStore {
  const clone = <T>(value: T): T => structuredClone(value)
  const nowDate = (): Date => context.now?.() ?? new Date()
  const stamp = (): string => nowDate().toISOString()
  const seededAt = stamp()

  let types: MachineType[] = SEED_TYPES.map(([id, name]) => ({ id, name, createdAt: seededAt, updatedAt: seededAt }))
  let machines: Machine[] = SEED_MACHINES.map(([id, machineTypeId, name]) => ({
    id,
    machineTypeId,
    name,
    inService: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  }))
  let hours: WorkingHours = clone(DEFAULT_WORKING_HOURS)
  // machineId -> downtime windows (D-028).
  const downtimes = new Map<string, MachineDowntime[]>()
  const allDowntimes = (): MachineDowntime[] => [...downtimes.values()].flat()
  // userId -> machine type ids; users without an entry have none.
  const qualifications = new Map<string, string[]>()
  // `${date}|${userId}` -> override
  const overrides = new Map<string, boolean>()
  const drafts = new Map<string, ProductionPlan>()
  const published = new Map<string, ProductionPlan>()
  let sequence = 1

  // Everyone in the demo shop may run every machine type until an admin narrows it.
  const qualificationsOf = (userId: string): string[] => qualifications.get(userId) ?? types.map((type) => type.id)

  // Attendance is its own module (Prisustvo) but shares this store, since the
  // planner reads its overrides; every other route needs planning.
  type Gate = 'planning' | 'attendance'
  const requireModule = (gate: Gate): void => {
    if (gate === 'attendance' && !context.modules().attendance) throw fixtureError(403, ATTENDANCE_DISABLED_MESSAGE)
    if (gate === 'planning' && !context.modules().planning) throw fixtureError(403, PLANNING_DISABLED_MESSAGE)
  }
  const requireUser = (gate: Gate = 'planning'): { id: string; username: string; role: 'admin' | 'user' } => {
    requireModule(gate)
    const user = context.currentUser()
    if (!user) throw fixtureError(401, MESSAGES.loginRequired)
    return user
  }
  const requireAdmin = (gate: Gate = 'planning'): { id: string; username: string; role: 'admin' | 'user' } => {
    const user = requireUser(gate)
    if (user.role !== 'admin') throw fixtureError(403, MESSAGES.adminOnly)
    return user
  }

  const today = (): string => localMoment(nowDate(), hours.timeZone).date
  const checkDate = (date: string): void => {
    if (!validDate(date)) throw fixtureError(400, MESSAGES.badDate)
  }

  const presenceOf = (userId: string, date: string): boolean => {
    const override = overrides.get(`${date}|${userId}`)
    if (override !== undefined) return override
    const current = today()
    if (date < current) return false
    if (date > current) return true
    // Today: signed in. The fixture treats the signed-in user as the only sign-in.
    return context.currentUser()?.id === userId
  }

  const attendanceEntry = (user: { id: string; username: string }, date: string): AttendanceEntry => {
    const current = today()
    const signedIn = date === current && context.currentUser()?.id === user.id
    const override = overrides.get(`${date}|${user.id}`)
    return {
      userId: user.id,
      username: user.username,
      date,
      signedIn,
      override: override ?? null,
      present: presenceOf(user.id, date),
    }
  }

  const sourceOrders = (): PlannerOrder[] => {
    const graphs = new Map(context.processes().map((entry) => [entry.workOrderId, entry.graph]))
    const result: PlannerOrder[] = []
    for (const order of context.orders()) {
      const graph = graphs.get(order.id)
      if (!graph || CLOSED_STATUSES.has(order.status)) continue
      result.push({
        id: order.id,
        number: order.orderNumber,
        clientName: order.clientName,
        dueDate: order.dueDate,
        priority: order.priority,
        quantity: order.quantity ?? 1,
        graph,
        createdAt: order.createdAt,
      })
    }
    return result
  }

  const workers = (planDate: string): PlannerWorker[] => {
    const horizonDates = new Set<string>()
    for (let i = 0; i <= PLANNING_FORECAST_DAYS * 3; i++) horizonDates.add(addDays(planDate, i))
    return context.users().map((user) => {
      const presence: Record<string, boolean> = {}
      for (const date of horizonDates) {
        // The plan date follows the attendance rules; later days count everyone
        // present unless overridden.
        presence[date] = date === planDate ? presenceOf(user.id, date) : (overrides.get(`${date}|${user.id}`) ?? true)
      }
      return { userId: user.id, username: user.username, machineTypeIds: qualificationsOf(user.id), presence }
    })
  }

  const plannerBase = (planDate: string) => ({
    hours,
    date: planDate,
    machineTypes: types,
    machines,
    downtimes: allDowntimes(),
    workers: workers(planDate),
    orders: sourceOrders(),
  })

  const makePlan = (
    date: string,
    status: ProductionPlan['status'],
    assignments: PlanAssignment[],
    issues: ProductionPlan['issues'],
    lateOrders: OrderForecast[],
    previous?: ProductionPlan,
    horizonEnd?: string,
  ): ProductionPlan => {
    const user = context.currentUser()?.username ?? ''
    const at = stamp()
    return {
      id: previous?.id ?? `plan-${sequence++}`,
      date,
      status,
      horizonEnd: horizonEnd ?? previous?.horizonEnd ?? date,
      generatedAt: previous?.generatedAt ?? at,
      generatedBy: previous?.generatedBy ?? user,
      updatedAt: at,
      updatedBy: user,
      publishedAt: status === 'published' ? at : null,
      publishedBy: status === 'published' ? user : null,
      assignments,
      issues,
      lateOrders,
    }
  }

  /** The run's last working day: PLANNING_FORECAST_DAYS working days from the plan date. */
  const horizonEndFor = (date: string): string => {
    const days = workingDays(hours, date, PLANNING_FORECAST_DAYS)
    return days.length > 0 ? days[days.length - 1].date : date
  }
  const blockDate = (block: PlanAssignment): string => block.start.slice(0, 10)
  const stepKey = (item: { workOrderId: string; stepNodeId?: string }): string => `${item.workOrderId}:${item.stepNodeId ?? ''}`

  /** What the plan endpoints show: the date's blocks and the issues that concern that day. */
  const planView = (plan: ProductionPlan, date: string): ProductionPlan => {
    const assignments = plan.assignments.filter((block) => blockDate(block) === date)
    const placed = new Set(assignments.map(stepKey))
    return {
      ...plan,
      assignments,
      issues: plan.issues.filter(
        (issue) => UNPLACEABLE_ISSUES.has(issue.code) || issue.code === 'conflict' || placed.has(stepKey(issue)),
      ),
    }
  }

  /** Every block of a plan grouped by day, plan date first. */
  const horizonOf = (plan: ProductionPlan): PlanHorizon => {
    const days: PlanHorizon['days'] = []
    const sorted = [...plan.assignments].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
    for (const block of sorted) {
      const date = blockDate(block)
      const last = days[days.length - 1]
      if (last && last.date === date) last.assignments.push(block)
      else days.push({ date, assignments: [block] })
    }
    return {
      planId: plan.id,
      status: plan.status,
      date: plan.date,
      horizonEnd: plan.horizonEnd,
      generatedAt: plan.generatedAt,
      updatedAt: plan.updatedAt,
      days,
      issues: plan.issues,
    }
  }

  /** Steps of the open orders that are neither done nor skipped. */
  const openStepKeys = (): Set<string> => {
    const open = new Set<string>()
    for (const order of sourceOrders()) {
      for (const node of order.graph.nodes) {
        if (node.kind !== 'step') continue
        const status = stepStatus(node)
        if (status !== 'done' && status !== 'skipped') open.add(`${order.id}:${node.id}`)
      }
    }
    return open
  }

  /** A published plan's blocks of the open steps it anchors on its own date (carry-over parts included). */
  const anchoredBlocks = (plan: ProductionPlan, open: Set<string>): PlanAssignment[] => {
    const anchored = new Set(
      plan.assignments.filter((block) => blockDate(block) === plan.date && open.has(stepKey(block))).map(stepKey),
    )
    return plan.assignments.filter((block) => anchored.has(stepKey(block)))
  }

  /** Published plans dated from `from` (inclusive) up to `before` (exclusive), oldest first. */
  const publishedFrom = (from: string, before = PLAN_DATE_MAX): ProductionPlan[] =>
    [...published.values()]
      .filter((plan) => plan.date >= from && plan.date < before)
      .sort((a, b) => a.date.localeCompare(b.date))

  const sortedByName = <T extends { name: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, 'sr'))

  const checkTypeName = (raw: string): string => {
    const name = raw.trim()
    if (name === '') throw fixtureError(422, MESSAGES.typeNameRequired)
    if ([...name].length > MAX_MACHINE_NAME_LENGTH) throw fixtureError(422, MESSAGES.typeNameTooLong)
    return name
  }
  const checkMachine = (input: { machineTypeId: string; name: string; note?: string }, selfId?: string): string => {
    const name = input.name.trim()
    if (name === '') throw fixtureError(422, MESSAGES.machineNameRequired)
    if ([...name].length > MAX_MACHINE_NAME_LENGTH) throw fixtureError(422, MESSAGES.machineNameTooLong)
    if ((input.note ?? '').length > MAX_MACHINE_NOTE_LENGTH) throw fixtureError(422, MESSAGES.machineNoteTooLong)
    if (!types.some((type) => type.id === input.machineTypeId)) throw fixtureError(422, MESSAGES.typeMissing)
    if (machines.some((m) => m.id !== selfId && m.name.toLowerCase() === name.toLowerCase())) {
      throw fixtureError(409, MESSAGES.machineDuplicate)
    }
    return name
  }

  const queueDate = (date?: string): string => {
    const value = date ?? today()
    checkDate(value)
    return value
  }

  return {
    api: {
      async listMachineTypes() {
        requireUser()
        return clone(sortedByName(types))
      },
      async createMachineType(input) {
        requireAdmin()
        const name = checkTypeName(input.name)
        if (types.some((type) => type.name.toLowerCase() === name.toLowerCase())) {
          throw fixtureError(409, MESSAGES.typeDuplicate)
        }
        const at = stamp()
        const created: MachineType = { id: `mt-${sequence++}`, name, createdAt: at, updatedAt: at }
        types = [...types, created]
        return clone(created)
      },
      async updateMachineType(id, input) {
        requireAdmin()
        const current = types.find((type) => type.id === id)
        if (!current) throw fixtureError(404, MESSAGES.typeMissing)
        const name = checkTypeName(input.name)
        if (types.some((type) => type.id !== id && type.name.toLowerCase() === name.toLowerCase())) {
          throw fixtureError(409, MESSAGES.typeDuplicate)
        }
        const updated = { ...current, name, updatedAt: stamp() }
        types = types.map((type) => (type.id === id ? updated : type))
        return clone(updated)
      },
      async deleteMachineType(id) {
        requireAdmin()
        if (!types.some((type) => type.id === id)) throw fixtureError(404, MESSAGES.typeMissing)
        if (machines.some((machine) => machine.machineTypeId === id)) throw fixtureError(409, MESSAGES.typeInUse)
        types = types.filter((type) => type.id !== id)
        for (const [userId, ids] of qualifications) qualifications.set(userId, ids.filter((typeId) => typeId !== id))
      },
      async listMachines() {
        requireUser()
        return clone(sortedByName(machines))
      },
      async createMachine(input) {
        requireAdmin()
        const name = checkMachine(input)
        const at = stamp()
        const created: Machine = {
          id: `mc-${sequence++}`,
          machineTypeId: input.machineTypeId,
          name,
          inService: input.inService,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          createdAt: at,
          updatedAt: at,
        }
        machines = [...machines, created]
        return clone(created)
      },
      async updateMachine(id, input) {
        requireAdmin()
        const current = machines.find((machine) => machine.id === id)
        if (!current) throw fixtureError(404, MESSAGES.machineMissing)
        const name = checkMachine(input, id)
        const updated: Machine = {
          id: current.id,
          createdAt: current.createdAt,
          machineTypeId: input.machineTypeId,
          name,
          inService: input.inService,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          updatedAt: stamp(),
        }
        machines = machines.map((machine) => (machine.id === id ? updated : machine))
        return clone(updated)
      },
      async deleteMachine(id) {
        requireAdmin()
        if (!machines.some((machine) => machine.id === id)) throw fixtureError(404, MESSAGES.machineMissing)
        machines = machines.filter((machine) => machine.id !== id)
        downtimes.delete(id)
      },
      async listMachineDowntimes(machineId) {
        requireUser()
        if (!machines.some((machine) => machine.id === machineId)) throw fixtureError(404, MESSAGES.machineMissing)
        return clone([...(downtimes.get(machineId) ?? [])].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)))
      },
      async createMachineDowntime(machineId, input) {
        requireAdmin()
        const from = input.from.trim()
        const to = input.to.trim()
        if (!validLocal(from) || !validLocal(to)) throw fixtureError(422, MESSAGES.downtimeTime)
        if (from >= to) throw fixtureError(422, MESSAGES.downtimeOrder)
        const note = (input.note ?? '').trim()
        if ([...note].length > MAX_MACHINE_NOTE_LENGTH) throw fixtureError(422, MESSAGES.downtimeNoteTooLong)
        if (!machines.some((machine) => machine.id === machineId)) throw fixtureError(404, MESSAGES.machineMissing)
        const created: MachineDowntime = {
          id: `down-${sequence++}`,
          machineId,
          from,
          to,
          ...(note ? { note } : {}),
          createdAt: stamp(),
        }
        downtimes.set(machineId, [...(downtimes.get(machineId) ?? []), created])
        return clone(created)
      },
      async deleteMachineDowntime(machineId, downtimeId) {
        requireAdmin()
        if (!machines.some((machine) => machine.id === machineId)) throw fixtureError(404, MESSAGES.machineMissing)
        const list = downtimes.get(machineId) ?? []
        if (!list.some((downtime) => downtime.id === downtimeId)) throw fixtureError(404, MESSAGES.downtimeMissing)
        downtimes.set(machineId, list.filter((downtime) => downtime.id !== downtimeId))
      },
      async listQualifications() {
        requireUser()
        return context.users().map(
          (user): WorkerQualifications => ({
            userId: user.id,
            username: user.username,
            machineTypeIds: [...qualificationsOf(user.id)],
          }),
        )
      },
      async setQualifications(userId, input) {
        requireAdmin()
        const user = context.users().find((candidate) => candidate.id === userId)
        if (!user) throw fixtureError(404, MESSAGES.userMissing)
        const unique = [...new Set(input.machineTypeIds)]
        if (unique.some((typeId) => !types.some((type) => type.id === typeId))) {
          throw fixtureError(422, MESSAGES.typeMissing)
        }
        qualifications.set(userId, unique)
        return { userId, username: user.username, machineTypeIds: [...unique] }
      },
      async listAttendance(date) {
        requireUser('attendance')
        checkDate(date)
        return context.users().map((user) => attendanceEntry(user, date))
      },
      async setAttendance(userId, input) {
        requireAdmin('attendance')
        checkDate(input.date)
        const user = context.users().find((candidate) => candidate.id === userId)
        if (!user) throw fixtureError(404, MESSAGES.userMissing)
        const key = `${input.date}|${userId}`
        if (input.present === null) overrides.delete(key)
        else overrides.set(key, input.present)
        return attendanceEntry(user, input.date)
      },
      async getWorkingHours() {
        requireUser()
        return clone(hours)
      },
      async setWorkingHours(input) {
        requireAdmin()
        const problem = hoursProblem(input)
        if (problem) throw fixtureError(422, problem)
        hours = clone({
          timeZone: input.timeZone,
          days: [...input.days].sort((a, b) => a.weekday - b.weekday),
          transferMinutes: input.transferMinutes,
          exceptions: [...(input.exceptions ?? [])]
            .map((exception) =>
              exception.off
                ? { date: exception.date, off: true, breaks: [] }
                : { date: exception.date, off: false, start: exception.start, end: exception.end, breaks: exception.breaks ?? [] },
            )
            .sort((a, b) => a.date.localeCompare(b.date)),
        })
        return clone(hours)
      },
      async getPlanDay(date) {
        const user = requireUser()
        checkDate(date)
        const publishedPlan = published.get(date)
        const publishedView = publishedPlan ? planView(publishedPlan, date) : null
        let drift: PlanDay['drift'] = null
        if (publishedView && date === today()) {
          drift = computeDrift(publishedView, sourceOrders(), localMoment(nowDate(), hours.timeZone), allDowntimes())
        }
        const draft = drafts.get(date)
        return clone({
          date,
          draft: user.role === 'admin' && draft ? planView(draft, date) : null,
          published: publishedView,
          drift,
        })
      },
      async getPlanHorizon(date) {
        requireAdmin()
        checkDate(date)
        const draft = drafts.get(date)
        const publishedPlan = published.get(date)
        const result: PlanDayHorizon = {
          date,
          draft: draft ? horizonOf(draft) : null,
          published: publishedPlan ? horizonOf(publishedPlan) : null,
        }
        return clone(result)
      },
      async generatePlan(input) {
        requireAdmin()
        checkDate(input.date)
        const current = today()
        if (input.date < current) throw fixtureError(422, MESSAGES.pastDate)
        if (input.replan && input.date !== current) throw fixtureError(422, MESSAGES.replanToday)

        const now: LocalMoment = localMoment(nowDate(), hours.timeZone)
        // Pinned (D-028): with replan the published plan's locked blocks; for a
        // later date the open steps the published plans of today up to the day
        // before anchor on their own dates, so consecutive days stay coherent.
        const pinned: PlanAssignment[] = input.replan
          ? (published.get(input.date)?.assignments ?? []).filter((block) => block.locked)
          : []
        if (input.date > current) {
          const open = openStepKeys()
          const seen = new Set(pinned.map((block) => block.id))
          for (const plan of publishedFrom(current, input.date)) {
            for (const block of anchoredBlocks(plan, open)) {
              if (seen.has(block.id)) continue
              seen.add(block.id)
              pinned.push(block)
            }
          }
        }
        const result = planDay({
          ...plannerBase(input.date),
          ...(input.replan ? { start: now } : {}),
          pinned,
        })
        // The plan keeps its whole horizon from the plan date on; pinned context
        // from earlier dates is left out.
        const assignments = result.assignments.filter((block) => blockDate(block) >= input.date)
        const plan = makePlan(
          input.date,
          'draft',
          assignments,
          result.issues,
          result.forecast.filter((entry) => entry.late),
          drafts.get(input.date),
          horizonEndFor(input.date),
        )
        drafts.set(input.date, plan)
        return clone(planView(plan, input.date))
      },
      async updatePlanDraft(input) {
        requireAdmin()
        checkDate(input.date)
        const draft = drafts.get(input.date)
        if (!draft) throw fixtureError(404, MESSAGES.noDraft)
        if (input.assignments.length > MAX_ASSIGNMENTS) throw fixtureError(422, MESSAGES.tooManyAssignments)
        // Conflicts are reported, not rejected; earlier planner issues stay.
        const kept = draft.issues.filter((issue) => issue.code !== 'conflict')
        const conflicts = checkDraft(plannerBase(input.date), input.assignments)
        // Hand edits apply to the plan date; the horizon's later days stay.
        const later = draft.assignments.filter((block) => blockDate(block) !== input.date)
        const updated = makePlan(
          input.date,
          'draft',
          [...clone(input.assignments), ...later],
          [...kept, ...conflicts],
          draft.lateOrders,
          draft,
        )
        drafts.set(input.date, updated)
        return clone(planView(updated, input.date))
      },
      async deletePlanDraft(date) {
        requireAdmin()
        checkDate(date)
        drafts.delete(date)
      },
      async publishPlan(input) {
        requireAdmin()
        checkDate(input.date)
        const draft = drafts.get(input.date)
        if (!draft) throw fixtureError(404, MESSAGES.noDraft)
        const plan = makePlan(input.date, 'published', draft.assignments, draft.issues, draft.lateOrders, draft)
        published.set(input.date, plan)
        drafts.delete(input.date)
        return clone(planView(plan, input.date))
      },
      async getMyQueue(date) {
        const user = requireUser()
        const value = queueDate(date)
        const plan = published.get(value)
        const orders = new Map(sourceOrders().map((order) => [order.id, order]))
        const items = (plan?.assignments ?? [])
          .filter((block) => blockDate(block) === value && block.userIds.includes(user.id))
          .map((block) => {
            const step = orders.get(block.workOrderId)?.graph.nodes.find((node) => node.id === block.stepNodeId)
            return {
              ...clone(block),
              stepStatus: step ? stepStatus(step) : ('pending' as const),
              isLead: block.leadUserId === user.id,
            }
          })
        const result: MyQueue = { date: value, publishedAt: plan?.publishedAt ?? null, items }
        return result
      },
      async getPlanningForecast() {
        requireUser()
        const current = today()
        const now = localMoment(nowDate(), hours.timeZone)
        const days = workingDays(hours, current, 1)
        // From now on a working day, otherwise from the next shift start.
        const start: LocalMoment | undefined = days[0]?.date === current ? now : undefined
        // Published plans from today on are pinned (the open steps each anchors
        // on its own date, except blocks already over), so the forecast never
        // contradicts them (D-028).
        const open = openStepKeys()
        const notOver = (block: PlanAssignment): boolean => {
          const [date, time] = block.end.split('T')
          return date > now.date || (date === now.date && parseClock(time ?? '00:00') > now.minutes)
        }
        const pinned: PlanAssignment[] = []
        const seen = new Set<string>()
        for (const plan of publishedFrom(current)) {
          for (const block of anchoredBlocks(plan, open)) {
            if (!notOver(block) || seen.has(block.id)) continue
            seen.add(block.id)
            pinned.push(block)
          }
        }
        const result = planDay({
          ...plannerBase(current),
          start,
          horizonDays: PLANNING_FORECAST_DAYS,
          pinned,
        })
        return clone(result.forecast)
      },
      async getMaterialNeeds(query = {}) {
        // Like the API (D-028): planning and stock modules, every signed-in user.
        requireUser()
        if (!context.modules().stock) throw fixtureError(403, STOCK_DISABLED_MESSAGE)
        const from = query.from || today()
        checkDate(from)
        if (query.to) checkDate(query.to)
        // The most recent published plan before the window and every later one.
        const earlier = [...published.values()]
          .filter((plan) => plan.date < from)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1)
        const plans = [...(earlier ? [earlier] : []), ...publishedFrom(from)]
        const to = query.to || defaultMaterialNeedsEnd(from, plans, DEFAULT_MATERIAL_NEEDS_DAYS)
        const weeks = materialWeeks(from, to)
        if (weeks === 'date') throw fixtureError(400, MESSAGES.badDate)
        if (weeks === 'order') throw fixtureError(422, MESSAGES.materialsOrder)
        if (weeks === 'span') throw fixtureError(422, MESSAGES.materialsSpan)
        const open = new Set(
          context.orders().filter((order) => !CLOSED_STATUSES.has(order.status)).map((order) => order.id),
        )
        const orders = context
          .processes()
          .filter((entry) => open.has(entry.workOrderId))
          .map((entry) => ({ workOrderId: entry.workOrderId, graph: entry.graph, factor: entry.factor ?? 1 }))
        const levels = (await context.stockLevels?.()) ?? []
        const stock = new Map(levels.map((level) => [level.catalogItemId, level]))
        return clone(buildMaterialNeeds({ weeks, plans, orders, stock }))
      },
      async getPlanningLoad(query = {}) {
        const user = requireUser()
        const current = today()
        const from = query.from ?? current
        checkDate(from)
        if (query.to !== undefined) checkDate(query.to)
        if (query.plan !== undefined && query.plan !== 'published' && query.plan !== 'draft') {
          throw fixtureError(400, LOAD_MESSAGES.badPlan)
        }
        const wantsDraft = query.plan === 'draft'
        if (wantsDraft && user.role !== 'admin') throw fixtureError(403, MESSAGES.adminOnly)
        if (wantsDraft && from !== current) throw fixtureError(422, LOAD_MESSAGES.draftToday)
        const last = addDays(from, MAX_LOAD_DAYS - 1)
        if (query.to !== undefined && query.to < from) throw fixtureError(422, LOAD_MESSAGES.rangeOrder)
        if (query.to !== undefined && query.to > last) throw fixtureError(422, LOAD_MESSAGES.rangeTooLong)
        let plans = [...published.values()]
        if (wantsDraft) {
          const draft = drafts.get(current)
          if (!draft) throw fixtureError(404, MESSAGES.noDraft)
          plans = [...plans.filter((plan) => plan.date !== current), draft]
        }
        const to = query.to ?? defaultLoadTo(plans, from, last)
        const dates: string[] = []
        for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date)
        return clone(
          computeLoad({
            hours,
            from,
            to,
            machineTypes: types,
            machines,
            downtimes: allDowntimes(),
            workers: context.users().map((entry) => ({
              userId: entry.id,
              username: entry.username,
              presence: Object.fromEntries(dates.map((date) => [date, presenceOf(entry.id, date)])),
            })),
            blocks: loadBlocks(plans, from, to),
            source: wantsDraft ? 'draft' : 'published',
          }),
        )
      },
    },
  }
}
