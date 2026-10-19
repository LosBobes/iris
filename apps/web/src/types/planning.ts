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

export interface WorkingHours {
  /** IANA time zone, e.g. "Europe/Belgrade". */
  timeZone: string
  days: WorkingDay[]
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

export interface ProductionPlan {
  id: string
  date: string
  status: PlanStatus
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
