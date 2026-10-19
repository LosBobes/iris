// Pure helpers for the Planiranje timeline. Plan blocks carry local
// "YYYY-MM-DDTHH:MM" timestamps (no zone), so everything here is string and
// minutes-of-day arithmetic: no Date objects, no time-zone surprises.

import type { PlanAssignment, WorkingHours } from '@/types/planning'

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

/** "HH:MM" to minutes since midnight (NaN when malformed). */
export function toMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) return Number.NaN
  return Number(match[1]) * 60 + Number(match[2])
}

export function fromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0')
  const mm = String(clamped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** "YYYY-MM-DDTHH:MM" to "HH:MM". */
export function timeOfLocal(local: string): string {
  return local.slice(11, 16)
}

/** "YYYY-MM-DDTHH:MM" to "YYYY-MM-DD". */
export function dateOfLocal(local: string): string {
  return local.slice(0, 10)
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

/** Whether a value is a local "YYYY-MM-DDTHH:MM" naming a real calendar date. */
export function isLocalDateTime(value: string): boolean {
  const match = LOCAL_PATTERN.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
}

/** Local "YYYY-MM-DDTHH:MM" as the user-facing "DD.MM.YYYY HH:MM". */
export function formatLocalDateTime(local: string): string {
  const match = LOCAL_PATTERN.exec(local)
  if (!match) return local
  const [, year, month, day, hour, minute] = match
  return `${day}.${month}.${year} ${hour}:${minute}`
}

export function minutesOfLocal(local: string): number {
  return toMinutes(timeOfLocal(local))
}

/** Same day, new time of day. */
export function withTime(local: string, time: string): string {
  return `${dateOfLocal(local)}T${time}`
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a "YYYY-MM-DD" date. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const dow = new Date(year, month - 1, day).getDay()
  return dow === 0 ? 7 : dow
}

export interface DayWindow {
  /** Minutes since midnight, aligned to whole hours. */
  start: number
  end: number
}

const FALLBACK_WINDOW: DayWindow = { start: 7 * 60, end: 15 * 60 }

/**
 * The visible part of the day: the shift of that weekday widened to cover any
 * block that lies outside it (overtime, a changed calendar), on whole hours.
 */
export function dayWindow(
  date: string,
  hours: WorkingHours | undefined,
  assignments: readonly PlanAssignment[],
): DayWindow {
  // An exception date (day off or one-off hours, D-028) replaces the weekday's shift.
  const exception = (hours?.exceptions ?? []).find((entry) => entry.date === date)
  const day = exception
    ? exception.off
      ? undefined
      : { start: exception.start ?? '', end: exception.end ?? '' }
    : hours?.days.find((entry) => entry.weekday === isoWeekday(date))
  let start = day ? toMinutes(day.start) : Number.NaN
  let end = day ? toMinutes(day.end) : Number.NaN
  for (const assignment of assignments) {
    const s = minutesOfLocal(assignment.start)
    const e = minutesOfLocal(assignment.end)
    if (!Number.isNaN(s)) start = Number.isNaN(start) ? s : Math.min(start, s)
    if (!Number.isNaN(e)) end = Number.isNaN(end) ? e : Math.max(end, e)
  }
  if (Number.isNaN(start) || Number.isNaN(end)) return FALLBACK_WINDOW
  start = Math.floor(start / 60) * 60
  end = Math.ceil(end / 60) * 60
  if (end - start < 60) end = start + 60
  return { start, end }
}

export interface LaneItem {
  id: string
  start: number
  end: number
}

/**
 * Greedy lane assignment so overlapping blocks of one row (conflicts) stack
 * instead of hiding each other.
 */
export function layoutLanes(items: readonly LaneItem[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    lanes.set(item.id, lane)
  }
  return { lanes, count: Math.max(1, laneEnds.length) }
}

/** Stable hue (0-359) per work order, so one order keeps one colour all day. */
export function orderHue(workOrderId: string): number {
  let hash = 0
  for (let i = 0; i < workOrderId.length; i += 1) {
    hash = (hash * 31 + workOrderId.charCodeAt(i)) >>> 0
  }
  return (hash * 47) % 360
}

/** Wall-clock length of a block in minutes (breaks included). */
export function spanMinutes(assignment: Pick<PlanAssignment, 'start' | 'end'>): number {
  return minutesOfLocal(assignment.end) - minutesOfLocal(assignment.start)
}
