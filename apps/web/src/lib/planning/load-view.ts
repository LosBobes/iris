// Pure helpers of the "Zauzetost" view (workstation load, D-028).

import { addDays } from '@/lib/planning/fixture-planner'

/**
 * How full a day is: `under` < 80 %, `near` 80–100 %, `over` > 100 % (also any
 * planned time with nothing available), `off` nothing available and nothing
 * planned (day off, unit out of service, person absent).
 */
export type LoadBand = 'under' | 'near' | 'over' | 'off'

export const NEAR_FULL_RATIO = 0.8

export function loadBand(planned: number, available: number): LoadBand {
  if (available <= 0) return planned > 0 ? 'over' : 'off'
  const ratio = planned / available
  if (ratio > 1) return 'over'
  if (ratio >= NEAR_FULL_RATIO) return 'near'
  return 'under'
}

/** Fill of a bar, 0–1 (an overloaded day is full). */
export function loadFill(planned: number, available: number): number {
  if (available <= 0) return planned > 0 ? 1 : 0
  return Math.min(1, planned / available)
}

/** Minutes as "h:mm" (e.g. 450 → "7:30"). */
export function formatLoadMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Whole percent of planned against available (null when nothing is available). */
export function loadPercent(planned: number, available: number): number | null {
  return available > 0 ? Math.round((planned / available) * 100) : null
}

/** Every calendar date from `from` to `to` inclusive ("YYYY-MM-DD"). */
export function calendarDates(from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = from; date <= to && dates.length < 366; date = addDays(date, 1)) dates.push(date)
  return dates
}

/** Days between two dates, inclusive (1 for the same date). */
export function rangeLength(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

export { addDays }
