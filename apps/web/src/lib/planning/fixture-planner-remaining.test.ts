import { describe, expect, it } from 'vitest'
import type { ProcessNode } from '@/types/process'
import type { MachineType, WorkingHours } from '@/types/planning'
import { planDay, workingMinutesBetween, type PlannerInput, type PlannerOrder } from './fixture-planner'

// Remaining minutes of in-progress steps (D-028), mirroring
// iris-api/internal/planner/remaining_test.go. 2026-10-19 is a Monday (CEST).

const hours: WorkingHours = {
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start: '07:00',
    end: '15:00',
    breaks: [{ start: '10:00', end: '10:30' }],
  })),
  transferMinutes: 0,
  exceptions: [],
}

const types: MachineType[] = [
  { id: 'mt-print', name: 'Štampa', createdAt: '', updatedAt: '' },
  { id: 'mt-cut', name: 'Sečenje', createdAt: '', updatedAt: '' },
]

function chain(minutes: number, startedAt: string | undefined): PlannerOrder {
  const nodes: ProcessNode[] = [
    { id: 's1', kind: 'step', label: 'Štampa', x: 0, y: 0, setupMinutes: minutes, machineTypeId: 'mt-print', status: 'in_progress', startedAt },
    { id: 's2', kind: 'step', label: 'Sečenje', x: 0, y: 0, setupMinutes: 30, machineTypeId: 'mt-cut' },
  ]
  return {
    id: 'o1',
    number: 'O1',
    clientName: 'Klijent',
    dueDate: null,
    priority: 'normal',
    quantity: 1,
    graph: { nodes, edges: [{ id: 's1-s2', source: 's1', target: 's2' }] },
    createdAt: '2026-10-01T00:00:00Z',
  }
}

function input(order: PlannerOrder, extra: Partial<PlannerInput>): PlannerInput {
  return {
    hours,
    date: '2026-10-19',
    machineTypes: types,
    machines: [
      { id: 'm-press', machineTypeId: 'mt-print', name: 'Press A', inService: true, createdAt: '', updatedAt: '' },
      { id: 'm-cut', machineTypeId: 'mt-cut', name: 'Giljotina', inService: true, createdAt: '', updatedAt: '' },
    ],
    workers: [
      { userId: 'ana', username: 'ana', machineTypeIds: ['mt-print', 'mt-cut'], presence: {} },
      { userId: 'boba', username: 'boba', machineTypeIds: ['mt-cut'], presence: {} },
    ],
    orders: [order],
    ...extra,
  }
}

const blocksOf = (result: ReturnType<typeof planDay>, stepId: string) =>
  result.assignments.filter((block) => block.stepNodeId === stepId).map(({ start, end, minutes, locked }) => ({ start, end, minutes, locked }))

describe('planDay remaining minutes (D-028)', () => {
  it('places a step started 2 h into 5 h, with a break in between, for 3 h', () => {
    // Started 09:00 (07:00Z), re-planned 11:30: 09:00-10:00 + 10:30-11:30 worked.
    const result = planDay(input(chain(300, '2026-10-19T07:00:00Z'), { start: { date: '2026-10-19', minutes: 11 * 60 + 30 } }))
    expect(blocksOf(result, 's1')).toEqual([{ start: '2026-10-19T11:30', end: '2026-10-19T14:30', minutes: 180, locked: true }])
    expect(result.issues).toEqual([])
  })

  it('counts only working time for a step started the day before', () => {
    // Started Monday 14:00 (12:00Z), re-planned Tuesday 08:00: 2 h worked.
    const result = planDay(
      input(chain(300, '2026-10-19T12:00:00Z'), { date: '2026-10-20', start: { date: '2026-10-20', minutes: 8 * 60 } }),
    )
    expect(blocksOf(result, 's1')).toEqual([{ start: '2026-10-20T08:00', end: '2026-10-20T11:30', minutes: 180, locked: true }])
  })

  it('keeps the full duration without a startedAt', () => {
    const result = planDay(input(chain(120, undefined), { start: { date: '2026-10-19', minutes: 11 * 60 } }))
    expect(blocksOf(result, 's1')).toEqual([{ start: '2026-10-19T11:00', end: '2026-10-19T13:00', minutes: 120, locked: true }])
  })

  it('reports an overrun and finishes the step at the start', () => {
    // 60-minute step started 07:00 (05:00Z), still running at 09:00.
    const result = planDay(input(chain(60, '2026-10-19T05:00:00Z'), { start: { date: '2026-10-19', minutes: 9 * 60 } }))
    expect(blocksOf(result, 's1')).toEqual([{ start: '2026-10-19T09:00', end: '2026-10-19T09:01', minutes: 1, locked: true }])
    expect(blocksOf(result, 's2')[0]?.start).toBe('2026-10-19T09:00')
    expect(result.issues.map((issue) => issue.code)).toEqual(['overrun'])
    expect(result.issues[0].message).toContain('120 min')
    expect(result.forecast[0].unplannable).toBe(false)
  })
})

describe('workingMinutesBetween', () => {
  it('excludes breaks, nights and weekends', () => {
    expect(workingMinutesBetween(hours, { date: '2026-10-19', minutes: 420 }, { date: '2026-10-19', minutes: 900 })).toBe(450)
    expect(workingMinutesBetween(hours, { date: '2026-10-16', minutes: 840 }, { date: '2026-10-19', minutes: 480 })).toBe(120)
    expect(workingMinutesBetween(hours, { date: '2026-10-19', minutes: 600 }, { date: '2026-10-19', minutes: 620 })).toBe(0)
    expect(workingMinutesBetween(hours, { date: '2026-10-19', minutes: 600 }, { date: '2026-10-19', minutes: 500 })).toBe(0)
  })
})
