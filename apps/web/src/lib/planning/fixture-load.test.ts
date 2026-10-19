import { describe, expect, it } from 'vitest'
import '@/i18n'
import { computeLoad, defaultLoadTo, loadBlocks } from './fixture-load'
import { DEFAULT_WORKING_HOURS } from './fixture-store'
import type { PlanAssignment, ProductionPlan } from '@/types/planning'

// Mirrors iris-api/internal/planner/load_test.go.

function block(id: string, start: string, minutes: number, machineId: string | null = 'm1', crew: string[] = []): PlanAssignment {
  return {
    id,
    workOrderId: `o-${id}`,
    orderNumber: `2026-${id}`,
    clientName: 'Klijent',
    stepNodeId: 's1',
    stepLabel: `Korak ${id}`,
    machineId,
    machineName: machineId ? 'M1' : '',
    leadUserId: 'u1',
    userIds: ['u1', ...crew],
    start,
    end: start,
    minutes,
    part: 1,
    parts: 1,
    locked: false,
  }
}

function plan(id: string, date: string, horizonEnd: string, assignments: PlanAssignment[]): ProductionPlan {
  return {
    id,
    date,
    status: 'published',
    horizonEnd,
    generatedAt: '',
    generatedBy: '',
    updatedAt: '',
    updatedBy: '',
    publishedAt: null,
    publishedBy: null,
    assignments,
    issues: [],
    lateOrders: [],
  }
}

describe('fixture workstation load', () => {
  it('picks the plan that speaks for each date', () => {
    const p1 = plan('p1', '2026-10-19', '2026-10-23', [
      block('a', '2026-10-19T07:00', 60),
      block('b', '2026-10-20T07:00', 60),
      block('c', '2026-10-22T07:00', 60),
      block('d', '2026-10-23T07:00', 60),
    ])
    const p2 = plan('p2', '2026-10-20', '', [block('e', '2026-10-20T09:00', 60)])
    const p3 = plan('p3', '2026-10-22', '2026-10-30', [block('f', '2026-10-22T09:00', 60), block('g', '2026-10-26T07:00', 60)])
    expect(loadBlocks([p3, p2, p1], '2026-10-19', '2026-10-23').map((entry) => entry.id)).toEqual(['a', 'e', 'f'])
    expect(defaultLoadTo([p1, p3], '2026-10-19', '2026-11-18')).toBe('2026-10-23')
    expect(defaultLoadTo([p1, p3], '2026-10-24', '2026-11-23')).toBe('2026-10-30')
    expect(defaultLoadTo([], '2026-10-24', '2026-11-23')).toBe('2026-10-24')
  })

  it('counts planned against available minutes', () => {
    const load = computeLoad({
      hours: { ...DEFAULT_WORKING_HOURS, exceptions: [{ date: '2026-10-21', off: true, breaks: [] }] },
      from: '2026-10-19',
      to: '2026-10-25',
      machineTypes: [{ id: 't1', name: 'Offset', createdAt: '', updatedAt: '' }],
      machines: [
        { id: 'm1', machineTypeId: 't1', name: 'M1', inService: true, createdAt: '', updatedAt: '' },
        { id: 'm2', machineTypeId: 't1', name: 'M2', inService: false, createdAt: '', updatedAt: '' },
      ],
      downtimes: [
        { id: 'd1', machineId: 'm1', from: '2026-10-20T10:00', to: '2026-10-20T12:00', createdAt: '' },
        { id: 'd2', machineId: 'm1', from: '2026-10-20T10:30', to: '2026-10-20T11:00', createdAt: '' },
      ],
      workers: [
        { userId: 'u2', username: 'bora', presence: { '2026-10-20': false } },
        { userId: 'u1', username: 'ana', presence: {} },
      ],
      blocks: [
        block('a', '2026-10-19T07:00', 490, 'm1', ['u2']),
        block('b', '2026-10-20T13:00', 60, null),
        block('c', '2026-10-24T08:00', 60),
      ],
    })
    expect(load.days).toEqual(['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'])
    expect(load.machineTypes.map((type) => type.name)).toEqual(['Offset', 'Bez mašine'])
    const [m1, m2] = load.machineTypes[0].units
    expect(m1.days[0]).toMatchObject({ plannedMinutes: 490, availableMinutes: 450 })
    expect(m1.days[1].availableMinutes).toBe(360)
    expect(m1.days[4]).toMatchObject({ plannedMinutes: 60, availableMinutes: 0 })
    expect(m2.days[0].availableMinutes).toBe(0)
    expect(load.machineTypes[0].days[0]).toEqual({ date: '2026-10-19', plannedMinutes: 490, availableMinutes: 450 })
    expect(load.machineTypes[1].units[0].days[1]).toMatchObject({ plannedMinutes: 60, availableMinutes: 0 })
    expect(load.people.map((person) => person.username)).toEqual(['ana', 'bora'])
    expect(load.people[1].days[0].plannedMinutes).toBe(490)
    expect(load.people[1].days[1].availableMinutes).toBe(0)
    expect(load.people[0].days[1]).toMatchObject({ plannedMinutes: 60, availableMinutes: 450 })
  })
})
