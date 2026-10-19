import { describe, expect, it } from 'vitest'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import type { MachineType, WorkingHours } from '@/types/planning'
import { planDay, shiftOn, type PlannerOrder } from './fixture-planner'
import { beforeWorkingMinutes, latestStartOf, type SegmentsOn } from './latest-start'

// Mirrors iris-api/internal/planner/latest_start_test.go: Monday 2026-10-19,
// Mon-Fri 07:00-15:00 with a 11:00-11:30 break (450 working minutes a day).
const MONDAY = '2026-10-19'

const hours = (transferMinutes = 0, exceptions: WorkingHours['exceptions'] = []): WorkingHours => ({
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '07:00', end: '15:00', breaks: [{ start: '11:00', end: '11:30' }] })),
  transferMinutes,
  exceptions,
})

const segmentsFor =
  (calendar: WorkingHours): SegmentsOn =>
  (date) => {
    const day = shiftOn(calendar, date)
    if (!day) return []
    const clock = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    const segments = [{ start: clock(day.start), end: clock(day.end) }]
    for (const b of day.breaks) {
      const last = segments[segments.length - 1]
      segments.splice(segments.length - 1, 1, { start: last.start, end: clock(b.start) }, { start: clock(b.end), end: last.end })
    }
    return segments
  }

const types: MachineType[] = [{ id: 'mt-print', name: 'Štampa', createdAt: '', updatedAt: '' }]

function step(id: string, minutes: number | null, extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, kind: 'step', label: id, x: 0, y: 0, ...(minutes === null ? {} : { setupMinutes: minutes }), ...extra }
}

function order(nodes: ProcessNode[], edges: [string, string][], dueDate: string | null): PlannerOrder {
  const graph: ProcessGraph = {
    nodes,
    edges: edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
  }
  return { id: 'o1', number: 'RN-1', clientName: 'Klijent', dueDate, priority: 'normal', quantity: 1, graph, createdAt: '2026-10-01T00:00:00Z' }
}

const chain = (dueDate: string | null, first: number | null, second: number | null): PlannerOrder =>
  order([step('s1', first), step('s2', second)], [['s1', 's2']], dueDate)

function forecast(o: PlannerOrder, calendar: WorkingHours) {
  const result = planDay({
    hours: calendar,
    date: MONDAY,
    machineTypes: types,
    machines: [],
    workers: [{ userId: 'ana', username: 'ana', machineTypeIds: [], presence: {} }],
    orders: [o],
  })
  const entry = result.forecast.find((f) => f.workOrderId === o.id)
  if (!entry) throw new Error('no forecast entry')
  return { latestStart: entry.latestStart, latestStartPassed: entry.latestStartPassed }
}

describe('beforeWorkingMinutes', () => {
  const segmentsOn = segmentsFor(hours())
  it.each([
    [{ date: '2026-10-19', minutes: 15 * 60 }, 240, { date: '2026-10-19', minutes: 10 * 60 + 30 }], // across the break
    [{ date: '2026-10-26', minutes: 7 * 60 }, 60, { date: '2026-10-23', minutes: 14 * 60 }], // across the weekend
    [{ date: '2026-10-24', minutes: 12 * 60 }, 30, { date: '2026-10-23', minutes: 14 * 60 + 30 }], // from a day off
    [{ date: '2026-10-19', minutes: 11 * 60 + 15 }, 15, { date: '2026-10-19', minutes: 10 * 60 + 45 }], // inside a break
    [{ date: '2026-10-19', minutes: 9 * 60 }, 0, { date: '2026-10-19', minutes: 9 * 60 }],
  ])('goes back from %o by %i working minutes', (from, minutes, want) => {
    expect(beforeWorkingMinutes(segmentsOn, from, minutes)).toEqual(want)
  })

  it('fails without working days', () => {
    expect(beforeWorkingMinutes(() => [], { date: MONDAY, minutes: 600 }, 10)).toBeNull()
  })
})

describe('latestStart in the fixture forecast (D-028)', () => {
  it('walks a two-step chain back across the weekend with the lag', () => {
    expect(forecast(chain('2026-10-26', 60, 450), hours(60))).toEqual({ latestStart: '2026-10-23', latestStartPassed: false })
    expect(forecast(chain('2026-10-26', 60, 451), hours(0))).toEqual({ latestStart: '2026-10-23', latestStartPassed: false })
  })

  it('uses the last working shift when the due date is a day off', () => {
    expect(forecast(chain('2026-10-24', 60, 450), hours(60)).latestStart).toBe('2026-10-22')
    const holiday = hours(60, [{ date: '2026-10-23', off: true }])
    expect(forecast(chain('2026-10-23', 60, 450), holiday).latestStart).toBe('2026-10-21')
  })

  it('marks a latest start before the plan date as passed', () => {
    expect(forecast(chain('2026-10-20', 450, 450), hours(60))).toEqual({ latestStart: '2026-10-16', latestStartPassed: true })
    expect(forecast(chain('2026-10-20', 450, 450), hours(0))).toEqual({ latestStart: '2026-10-19', latestStartPassed: false })
  })

  it('follows the longest branch through item nodes', () => {
    const item: ProcessNode = { id: 'p', kind: 'product', label: 'p', x: 0, y: 0 }
    const branched = order(
      [step('s1', 60), step('s3', 900), item, step('s2', 60)],
      [
        ['s1', 'p'],
        ['s3', 'p'],
        ['p', 's2'],
      ],
      '2026-10-23',
    )
    expect(forecast(branched, hours(0)).latestStart).toBe('2026-10-21')
  })

  it('skips finished steps and counts in-progress ones in full', () => {
    const done = order([step('s1', 60, { status: 'done' }), step('s2', 450)], [['s1', 's2']], '2026-10-26')
    expect(forecast(done, hours(60)).latestStart).toBe('2026-10-26')
    const running = order([step('s1', 60, { status: 'in_progress' }), step('s2', 450)], [['s1', 's2']], '2026-10-26')
    expect(forecast(running, hours(60)).latestStart).toBe('2026-10-23')
  })

  it('is omitted without a due date, with a missing duration or with nothing left', () => {
    const none = { latestStart: null, latestStartPassed: false }
    expect(forecast(chain(null, 60, 60), hours())).toEqual(none)
    expect(forecast(chain('2026-10-26', 60, null), hours())).toEqual(none)
    const finished = order([step('s1', 60, { status: 'done' }), step('s2', 60, { status: 'skipped' })], [['s1', 's2']], '2026-10-26')
    expect(forecast(finished, hours())).toEqual(none)
    const finishedUntimed = order([step('s1', null, { status: 'done' }), step('s2', 60)], [['s1', 's2']], '2026-10-26')
    expect(forecast(finishedUntimed, hours()).latestStart).toBe('2026-10-26')
  })

  it('works on the raw helper with a graph', () => {
    const o = chain('2026-10-26', 60, 450)
    expect(latestStartOf(o.graph, o.dueDate, 60, (s) => s.setupMinutes ?? null, segmentsFor(hours()))).toBe('2026-10-23')
  })
})
