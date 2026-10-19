// Pure helpers for the printable dispatch list ("Radni raspored", D-028): the
// published (or draft) plan blocks regrouped per machine unit or per person,
// one table per day with a daily total. No React, no clock reads.

import type { Machine, MachineType, PlanAssignment, PlanHorizonDay } from '@/types/planning'

export type DispatchGroupBy = 'machine' | 'person'

/** Longest range the print view covers (ranges read the admin-only horizon). */
export const MAX_DISPATCH_DAYS = 7

export interface DispatchDay {
  date: string
  /** Blocks of this group on this day, sorted by start. */
  rows: PlanAssignment[]
  /** Sum of `minutes` (working minutes, breaks excluded). */
  totalMinutes: number
}

export interface DispatchSection {
  key: string
  /** Machine unit name, "Bez mašine", or the person's username. */
  title: string
  /** Machine type name (machine grouping only; empty when unknown or without a machine). */
  groupLabel: string
  /** True for the steps planned without a machine. */
  noMachine: boolean
  days: DispatchDay[]
}

export interface DispatchLookups {
  machines: readonly Machine[]
  machineTypes: readonly MachineType[]
  /** userId to username. */
  userNames: ReadonlyMap<string, string>
  /** Title of the people-only section ("Bez mašine"). */
  noMachineLabel: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** Whether a value is a "YYYY-MM-DD" naming a real calendar date. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function addIsoDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The last date of a print range: `to` clamped into [date, date + 6]; a missing
 * or invalid `to` (or one not after `date`) means the single day.
 */
export function clampRangeEnd(date: string, to: string | null | undefined): string {
  if (!isIsoDate(to) || to <= date) return date
  const max = addIsoDays(date, MAX_DISPATCH_DAYS - 1)
  return to > max ? max : to
}

/** Working minutes as "h:mm" (e.g. 75 -> "1:15", 600 -> "10:00"). */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const compareText = (a: string, b: string): number => a.localeCompare(b, 'sr-Latn')

function byStart(a: PlanAssignment, b: PlanAssignment): number {
  return a.start.localeCompare(b.start) || compareText(a.orderNumber, b.orderNumber) || a.id.localeCompare(b.id)
}

interface Bucket {
  section: Omit<DispatchSection, 'days'>
  /** 0 = known machine type (or a person), 1 = unknown type, 2 = "Bez mašine". */
  rank: number
  byDay: Map<string, PlanAssignment[]>
}

/**
 * Regroups day blocks into printable sections. By machine: one section per
 * machine unit that has a block, ordered by machine type then unit name, with
 * the people-only steps last under "Bez mašine". By person: one section per
 * crew member (lead or not), ordered by name. Within a section every day keeps
 * its own table, rows by start, with the day's total minutes. Days keep the
 * order given; a day without a block for a section is left out of it.
 */
export function buildDispatchSections(
  days: readonly PlanHorizonDay[],
  groupBy: DispatchGroupBy,
  lookups: DispatchLookups,
): DispatchSection[] {
  const machineById = new Map(lookups.machines.map((machine) => [machine.id, machine]))
  const typeName = new Map(lookups.machineTypes.map((type) => [type.id, type.name]))
  const buckets = new Map<string, Bucket>()

  const add = (key: string, make: () => Omit<Bucket, 'byDay'>, date: string, block: PlanAssignment): void => {
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { ...make(), byDay: new Map() }
      buckets.set(key, bucket)
    }
    const rows = bucket.byDay.get(date) ?? []
    rows.push(block)
    bucket.byDay.set(date, rows)
  }

  for (const day of days) {
    for (const block of day.assignments) {
      if (groupBy === 'person') {
        for (const userId of new Set(block.userIds)) {
          const key = `user:${userId}`
          add(
            key,
            () => ({
              section: { key, title: lookups.userNames.get(userId) ?? userId, groupLabel: '', noMachine: false },
              rank: 0,
            }),
            day.date,
            block,
          )
        }
        continue
      }
      const machineId = block.machineId
      if (!machineId) {
        add(
          'no-machine',
          () => ({
            section: { key: 'no-machine', title: lookups.noMachineLabel, groupLabel: '', noMachine: true },
            rank: 2,
          }),
          day.date,
          block,
        )
        continue
      }
      const machine = machineById.get(machineId)
      const group = machine ? (typeName.get(machine.machineTypeId) ?? '') : ''
      const key = `machine:${machineId}`
      add(
        key,
        () => ({
          section: { key, title: machine?.name || block.machineName || machineId, groupLabel: group, noMachine: false },
          rank: group ? 0 : 1,
        }),
        day.date,
        block,
      )
    }
  }

  const dayOrder = days.map((day) => day.date)
  return [...buckets.values()]
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        compareText(a.section.groupLabel, b.section.groupLabel) ||
        compareText(a.section.title, b.section.title) ||
        a.section.key.localeCompare(b.section.key),
    )
    .map(({ section, byDay }) => ({
      ...section,
      days: dayOrder
        .filter((date) => byDay.has(date))
        .map((date) => {
          const rows = [...(byDay.get(date) ?? [])].sort(byStart)
          return { date, rows, totalMinutes: rows.reduce((sum, row) => sum + row.minutes, 0) }
        }),
    }))
}
