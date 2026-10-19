import { ApiError } from '@/lib/errors'
import { ATTENDANCE_DISABLED_MESSAGE, PLANNING_DISABLED_MESSAGE } from '@/lib/modules'
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
import { stepStatus } from '@/lib/process/graph'
import type { ProcessGraph } from '@/types/process'
import type { OrganizationModules } from '@/types/settings'
import {
  MAX_MACHINE_NAME_LENGTH,
  MAX_MACHINE_NOTE_LENGTH,
  PLANNING_FORECAST_DAYS,
  type AttendanceEntry,
  type Machine,
  type MachineType,
  type MyQueue,
  type OrderForecast,
  type PlanAssignment,
  type PlanDay,
  type ProductionPlan,
  type WorkerQualifications,
  type WorkingHours,
} from '@/types/planning'

// In-memory Planiranje store for fixture mode. It mirrors the API's validation,
// permissions and module gate closely enough for demos and UI development; the
// Go service stays authoritative. The plan comes from `fixture-planner.ts`.

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
}

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'invoiced'])
const MAX_ASSIGNMENTS = 2000

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
  /** Every order's process graph. */
  processes: () => { workOrderId: string; graph: ProcessGraph }[]
  /** Injected clock for tests. */
  now?: () => Date
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
  | 'listQualifications'
  | 'setQualifications'
  | 'listAttendance'
  | 'setAttendance'
  | 'getWorkingHours'
  | 'setWorkingHours'
  | 'getPlanDay'
  | 'generatePlan'
  | 'updatePlanDraft'
  | 'deletePlanDraft'
  | 'publishPlan'
  | 'getMyQueue'
  | 'getPlanningForecast'
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

function validClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function hoursProblem(hours: WorkingHours): string | null {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: hours.timeZone })
  } catch {
    return MESSAGES.badHours
  }
  const seen = new Set<number>()
  for (const day of hours.days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7 || seen.has(day.weekday)) {
      return MESSAGES.badHours
    }
    seen.add(day.weekday)
    if (!validClock(day.start) || !validClock(day.end) || parseClock(day.start) >= parseClock(day.end)) {
      return MESSAGES.badHours
    }
    let previousEnd = parseClock(day.start)
    const breaks = [...day.breaks].sort((a, b) => a.start.localeCompare(b.start))
    for (const gap of breaks) {
      if (!validClock(gap.start) || !validClock(gap.end)) return MESSAGES.badHours
      if (parseClock(gap.start) < previousEnd || parseClock(gap.start) >= parseClock(gap.end)) return MESSAGES.badHours
      if (parseClock(gap.end) > parseClock(day.end)) return MESSAGES.badHours
      previousEnd = parseClock(gap.end)
    }
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
  ): ProductionPlan => {
    const user = context.currentUser()?.username ?? ''
    const at = stamp()
    return {
      id: previous?.id ?? `plan-${sequence++}`,
      date,
      status,
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
        })
        return clone(hours)
      },
      async getPlanDay(date) {
        const user = requireUser()
        checkDate(date)
        const publishedPlan = published.get(date) ?? null
        let drift: PlanDay['drift'] = null
        if (publishedPlan && date === today()) {
          drift = computeDrift(publishedPlan, sourceOrders(), localMoment(nowDate(), hours.timeZone))
        }
        return clone({
          date,
          draft: user.role === 'admin' ? (drafts.get(date) ?? null) : null,
          published: publishedPlan,
          drift,
        })
      },
      async generatePlan(input) {
        requireAdmin()
        checkDate(input.date)
        const current = today()
        if (input.date < current) throw fixtureError(422, MESSAGES.pastDate)
        if (input.replan && input.date !== current) throw fixtureError(422, MESSAGES.replanToday)

        const now: LocalMoment = localMoment(nowDate(), hours.timeZone)
        const pinned = input.replan
          ? (published.get(input.date)?.assignments ?? []).filter((block) => block.locked)
          : []
        const result = planDay({
          ...plannerBase(input.date),
          ...(input.replan ? { start: now } : {}),
          pinned,
        })
        // The plan keeps the date's own blocks; the rest of the horizon is the forecast.
        const assignments = result.assignments.filter((block) => block.start.startsWith(input.date))
        const plan = makePlan(
          input.date,
          'draft',
          assignments,
          result.issues,
          result.forecast.filter((entry) => entry.late),
          drafts.get(input.date),
        )
        drafts.set(input.date, plan)
        return clone(plan)
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
        const updated = makePlan(
          input.date,
          'draft',
          clone(input.assignments),
          [...kept, ...conflicts],
          draft.lateOrders,
          draft,
        )
        drafts.set(input.date, updated)
        return clone(updated)
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
        return clone(plan)
      },
      async getMyQueue(date) {
        const user = requireUser()
        const value = queueDate(date)
        const plan = published.get(value)
        const orders = new Map(sourceOrders().map((order) => [order.id, order]))
        const items = (plan?.assignments ?? [])
          .filter((block) => block.userIds.includes(user.id))
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
        const result = planDay({
          ...plannerBase(current),
          start,
          horizonDays: PLANNING_FORECAST_DAYS,
          pinned: (published.get(current)?.assignments ?? []).filter((block) => block.locked),
        })
        return clone(result.forecast)
      },
    },
  }
}
