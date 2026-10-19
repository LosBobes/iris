// Production planning ("Planiranje", D-026) shapes. Contract-sync point with
// the Planning schemas in iris-api/openapi.yaml and
// iris-api/internal/domain/planning.go. Everything here sits behind the
// `planning` organization module.

import type { ProcessStepStatus } from './process'

/** Planning limits (mirrors internal/domain/planning.go). */
export const MAX_MACHINE_NAME_LENGTH = 120
export const MAX_MACHINE_NOTE_LENGTH = 500
export const MAX_CREW_SIZE = 50
export const MAX_STEP_MINUTES = 100000
export const PLANNING_FORECAST_DAYS = 14
export const MAX_TRANSFER_MINUTES = 480
export const MAX_WORKING_HOURS_EXCEPTIONS = 400

export interface MachineType {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface MachineTypeInput {
  name: string
}

/** One physical unit of a machine type; units out of service are never planned. */
export interface Machine {
  id: string
  machineTypeId: string
  name: string
  inService: boolean
  note?: string
  createdAt: string
  updatedAt: string
}

export interface MachineInput {
  machineTypeId: string
  name: string
  inService: boolean
  note?: string
}

/**
 * A dated window in which a machine unit is not available (D-028): planned
 * maintenance or a breakdown with a known end. `from`/`to` are local
 * "YYYY-MM-DDTHH:MM" in the working-hours time zone, `from` < `to`. The planner
 * treats it as busy time; a locked block overlapping it is a `machine_down`
 * issue and a hand-edited draft block a `conflict`.
 */
export interface MachineDowntime {
  id: string
  machineId: string
  from: string
  to: string
  note?: string
  createdAt: string
}

export interface MachineDowntimeInput {
  from: string
  to: string
  note?: string
}

/** Machine types one organization user may run (lead a step on). */
export interface WorkerQualifications {
  userId: string
  username: string
  machineTypeIds: string[]
}

export interface WorkerQualificationsInput {
  machineTypeIds: string[]
}

/**
 * One user's presence on a date: `signedIn` from sign-ins that day, `override`
 * the admin's explicit choice (null = none), `present` the effective value.
 */
export interface AttendanceEntry {
  userId: string
  username: string
  date: string
  signedIn: boolean
  override: boolean | null
  present: boolean
}

/** Sets (`present` true/false) or clears (`present` null) an override. */
export interface AttendanceInput {
  date: string
  present: boolean | null
}

/** "HH:MM" local time. */
export interface WorkingBreak {
  start: string
  end: string
}

/** ISO weekday: 1 = Monday … 7 = Sunday. Weekdays not listed are days off. */
export interface WorkingDay {
  weekday: number
  start: string
  end: string
  breaks: WorkingBreak[]
}

/**
 * Overrides the weekly pattern on one civil date (D-028): with `off` the date
 * is a day off whatever its weekday; otherwise `start`/`end`/`breaks` are that
 * date's one-off shift. The API omits `start`/`end` for a day off.
 */
export interface WorkingHoursException {
  date: string
  off: boolean
  start?: string
  end?: string
  breaks?: WorkingBreak[]
}

export interface WorkingHours {
  /** IANA time zone, e.g. "Europe/Belgrade". */
  timeZone: string
  days: WorkingDay[]
  /** Exception dates (at most 400, unique), consulted before `days`. */
  exceptions: WorkingHoursException[]
  /**
   * Inter-operation time ("međuoperacijsko vreme", D-028): the org-wide average
   * waiting + transfer time between two consecutive steps, in working minutes
   * (0–480). The planner starts a step no earlier than this after every upstream
   * step ends; 0 (the default) chains steps back to back.
   */
  transferMinutes: number
}

export type PlanStatus = 'draft' | 'published'

/**
 * One scheduled block of a step on one day. `start`/`end` are local
 * "YYYY-MM-DDTHH:MM"; `minutes` excludes breaks. A step carried over to later
 * days has one block per day (`part` of `parts`). `userIds` is the crew, lead
 * first. `locked` = in progress or done when planned; re-planning keeps it.
 */
export interface PlanAssignment {
  id: string
  workOrderId: string
  orderNumber: string
  clientName: string
  stepNodeId: string
  stepLabel: string
  machineId: string | null
  machineName: string
  leadUserId: string
  userIds: string[]
  start: string
  end: string
  minutes: number
  part: number
  parts: number
  locked: boolean
}

export type PlanIssueCode =
  | 'unknown_machine_type'
  | 'no_machine'
  | 'no_workers'
  | 'no_capacity'
  | 'missing_duration'
  | 'conflict'
  /** A locked block the plan keeps lies in a downtime window of its machine (D-028). */
  | 'machine_down'
  /** An in-progress step has been worked on longer than its planned duration (D-028); informational. */
  | 'overrun'

export interface PlanIssue {
  code: PlanIssueCode
  workOrderId: string
  orderNumber: string
  stepNodeId?: string
  stepLabel?: string
  /** User-facing Serbian message from the API. */
  message: string
}

export interface OrderForecast {
  workOrderId: string
  orderNumber: string
  clientName: string
  dueDate: string | null
  priority: string
  /** Local date the last step finishes; null when unplannable. */
  estimatedFinish: string | null
  late: boolean
  unplannable: boolean
}

/**
 * A day plan. The stored run keeps every block over the whole horizon (`date`
 * through `horizonEnd`, D-028); the plan endpoints return the blocks of `date`
 * only, `getPlanHorizon` the rest grouped by day.
 */
export interface ProductionPlan {
  id: string
  date: string
  status: PlanStatus
  /** Last working day the run could place steps on (14 working days from `date`; `date` for a day off). */
  horizonEnd: string
  generatedAt: string
  generatedBy: string
  updatedAt: string
  updatedBy: string
  publishedAt: string | null
  publishedBy: string | null
  assignments: PlanAssignment[]
  issues: PlanIssue[]
  lateOrders: OrderForecast[]
}

/** One day's blocks of a plan's kept horizon, sorted by start. */
export interface PlanHorizonDay {
  date: string
  assignments: PlanAssignment[]
}

/**
 * Every block a plan's run produced, grouped by day from the plan date to
 * `horizonEnd` (days without a block are left out), with the run's issues.
 * Hand edits only ever touch the plan date's blocks.
 */
export interface PlanHorizon {
  planId: string
  status: PlanStatus
  date: string
  horizonEnd: string
  generatedAt: string
  updatedAt: string
  days: PlanHorizonDay[]
  issues: PlanIssue[]
}

/** `GET /planning/plan/horizon` (admins): the kept horizon of the date's draft and published plan. */
export interface PlanDayHorizon {
  date: string
  draft: PlanHorizon | null
  published: PlanHorizon | null
}

/** Why a re-plan of today's published plan is suggested (empty = on track). */
export interface PlanDrift {
  suggested: boolean
  reasons: string[]
}

/** One date: draft (admins only; null for operators), published plan, drift (today only). */
export interface PlanDay {
  date: string
  draft: ProductionPlan | null
  published: ProductionPlan | null
  drift: PlanDrift | null
}

export interface PlanGenerateInput {
  date: string
  /** Start from now (date must be today) and keep locked blocks. */
  replan: boolean
}

export interface PlanDraftInput {
  date: string
  assignments: PlanAssignment[]
}

export interface PlanPublishInput {
  date: string
}

export interface MyQueueItem extends PlanAssignment {
  stepStatus: ProcessStepStatus
  isLead: boolean
}

export interface MyQueue {
  date: string
  publishedAt: string | null
  items: MyQueueItem[]
}
