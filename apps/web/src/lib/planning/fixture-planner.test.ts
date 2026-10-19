import { describe, expect, it } from 'vitest'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import type { Machine, MachineType, WorkingHours } from '@/types/planning'
import {
  checkDraft,
  computeDrift,
  localMoment,
  planDay,
  stepDurationMinutes,
  type PlannerInput,
  type PlannerOrder,
  type PlannerWorker,
} from './fixture-planner'

// 2026-10-19 is a Monday.
const MONDAY = '2026-10-19'

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
const machine = (id: string, typeId: string, name: string, inService = true): Machine => ({
  id,
  machineTypeId: typeId,
  name,
  inService,
  createdAt: '',
  updatedAt: '',
})
const machines: Machine[] = [machine('m-press', 'mt-print', 'Press A'), machine('m-guillotine', 'mt-cut', 'Giljotina')]

const worker = (id: string, typeIds: string[], presence: Record<string, boolean> = {}): PlannerWorker => ({
  userId: id,
  username: id,
  machineTypeIds: typeIds,
  presence,
})

function step(id: string, extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, kind: 'step', label: id, x: 0, y: 0, ...extra }
}

function order(id: string, nodes: ProcessNode[], edges: [string, string][], extra: Partial<PlannerOrder> = {}): PlannerOrder {
  const graph: ProcessGraph = {
    nodes,
    edges: edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
  }
  return {
    id,
    number: id.toUpperCase(),
    clientName: 'Klijent',
    dueDate: null,
    priority: 'normal',
    quantity: 1,
    graph,
    createdAt: '2026-10-01T00:00:00Z',
    ...extra,
  }
}

function input(orders: PlannerOrder[], extra: Partial<PlannerInput> = {}): PlannerInput {
  return {
    hours,
    date: MONDAY,
    machineTypes: types,
    machines,
    workers: [worker('ana', ['mt-print', 'mt-cut']), worker('boba', ['mt-cut'])],
    orders,
    ...extra,
  }
}

describe('stepDurationMinutes', () => {
  it('adds setup to per-unit time times the quantity (at least 1)', () => {
    expect(stepDurationMinutes(step('a', { setupMinutes: 10, minutesPerUnit: 2 }), 5)).toBe(20)
    expect(stepDurationMinutes(step('a', { setupMinutes: 10, minutesPerUnit: 2 }), 0)).toBe(12)
  })
})

describe('planDay', () => {
  it('starts at the shift start and respects dependencies through item nodes', () => {
    const o = order(
      'o1',
      [
        step('s1', { setupMinutes: 60, machineTypeId: 'mt-print' }),
        { id: 'i1', kind: 'product', label: 'Otisci', x: 0, y: 0 },
        step('s2', { setupMinutes: 30, machineTypeId: 'mt-cut' }),
      ],
      [
        ['s1', 'i1'],
        ['i1', 's2'],
      ],
    )
    const result = planDay(input([o]))
    const [first, second] = result.assignments
    expect(first.stepNodeId).toBe('s1')
    expect(first.start).toBe('2026-10-19T07:00')
    expect(second.stepNodeId).toBe('s2')
    expect(second.start >= first.end).toBe(true)
    expect(first.leadUserId).toBe('ana')
    expect(first.machineName).toBe('Press A')
  })

  it('inserts the inter-operation time between consecutive steps, in working time', () => {
    const chain = (first: number): PlannerOrder =>
      order(
        'o1',
        [step('s1', { setupMinutes: first, machineTypeId: 'mt-print' }), step('s2', { setupMinutes: 30, machineTypeId: 'mt-cut' })],
        [['s1', 's2']],
      )
    const lagged = (first: number, transferMinutes: number) =>
      planDay(input([chain(first)], { hours: { ...hours, transferMinutes } })).assignments.map((a) => a.start)
    // Inside the shift.
    expect(lagged(60, 30)).toEqual(['2026-10-19T07:00', '2026-10-19T08:30'])
    // s1 ends at the 10:00 break; the lag runs on after it.
    expect(lagged(180, 30)).toEqual(['2026-10-19T07:00', '2026-10-19T11:00'])
    // s1 fills Monday (450 working minutes); the lag spills into Tuesday.
    expect(lagged(450, 60)).toEqual(['2026-10-19T07:00', '2026-10-20T08:00'])
    // 0 keeps steps back to back, exactly as without the setting.
    expect(lagged(60, 0)).toEqual(planDay(input([chain(60)])).assignments.map((a) => a.start))
  })

  it('pauses for breaks and carries a long step over to the next working day', () => {
    // 07:00-10:00 + 10:30-15:00 = 450 work minutes per day.
    const o = order('o1', [step('s1', { setupMinutes: 600, machineTypeId: 'mt-print' })], [])
    const result = planDay(input([o]))
    expect(result.assignments).toHaveLength(2)
    const [day1, day2] = result.assignments
    expect(day1).toMatchObject({ start: '2026-10-19T07:00', end: '2026-10-19T15:00', minutes: 450, part: 1, parts: 2 })
    expect(day2).toMatchObject({ start: '2026-10-20T07:00', minutes: 150, part: 2, parts: 2 })
    expect(day2.machineId).toBe(day1.machineId)
    expect(day2.userIds).toEqual(day1.userIds)
    expect(result.forecast[0].estimatedFinish).toBe('2026-10-20')
  })

  it('works around a machine downtime window and flags a pinned block inside one', () => {
    const o = order('o1', [step('s1', { setupMinutes: 60, machineTypeId: 'mt-print' })], [])
    const downtimes = [{ id: 'd1', machineId: 'm-press', from: '2026-10-19T07:00', to: '2026-10-19T09:00', createdAt: '' }]
    const result = planDay(input([o], { downtimes }))
    expect(result.assignments[0]).toMatchObject({ start: '2026-10-19T09:00', end: '2026-10-19T10:00' })
    expect(result.issues).toEqual([])

    const pinned = { ...planDay(input([o])).assignments[0], locked: true }
    const kept = planDay(input([o], { downtimes, pinned: [pinned] }))
    expect(kept.assignments).toHaveLength(1)
    expect(kept.assignments[0]).toMatchObject({ start: '2026-10-19T07:00', locked: true })
    expect(kept.issues.map((i) => i.code)).toEqual(['machine_down'])
    expect(kept.issues[0].message).toContain('van pogona 19.10.2026 07:00 – 19.10.2026 09:00')
    expect(kept.forecast[0].unplannable).toBe(false)
  })

  it('treats an exception day off as non-working and one-off hours as a shift', () => {
    const withExceptions = {
      ...hours,
      exceptions: [
        { date: '2026-10-20', off: true },
        { date: '2026-10-24', off: false, start: '08:00', end: '12:00', breaks: [] },
      ],
    }
    const o = order('o1', [step('s1', { setupMinutes: 600, machineTypeId: 'mt-print' })], [])
    const result = planDay(input([o], { hours: withExceptions }))
    expect(result.assignments.map((a) => a.start.slice(0, 10))).toEqual(['2026-10-19', '2026-10-21'])
    const saturday = planDay(input([order('o1', [step('s1', { setupMinutes: 60, machineTypeId: 'mt-print' })], [])], { hours: withExceptions, date: '2026-10-24' }))
    expect(saturday.assignments[0]).toMatchObject({ start: '2026-10-24T08:00', end: '2026-10-24T09:00' })
  })

  it('skips weekends when carrying over', () => {
    const o = order('o1', [step('s1', { setupMinutes: 500, machineTypeId: 'mt-print' })], [])
    const friday = planDay(input([o], { date: '2026-10-23' }))
    expect(friday.assignments.map((a) => a.start.slice(0, 10))).toEqual(['2026-10-23', '2026-10-26'])
  })

  it('serialises two steps on the same machine unit', () => {
    const a = order('a', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [])
    const b = order('b', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [])
    const result = planDay(input([a, b]))
    const blocks = result.assignments.filter((x) => x.machineId === 'm-press')
    expect(blocks).toHaveLength(2)
    expect(blocks[1].start >= blocks[0].end).toBe(true)
  })

  it('places the more urgent order (less slack) first', () => {
    const relaxed = order('a', [step('s', { setupMinutes: 120, machineTypeId: 'mt-print' })], [], {
      dueDate: '2026-11-30',
      createdAt: '2026-09-01T00:00:00Z',
    })
    const tight = order('b', [step('s', { setupMinutes: 120, machineTypeId: 'mt-print' })], [], {
      dueDate: '2026-10-19',
    })
    const result = planDay(input([relaxed, tight]))
    expect(result.assignments[0].workOrderId).toBe('b')
  })

  it('prefers urgent priority over normal at equal slack, then the older order', () => {
    const normal = order('a', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [])
    const urgent = order('b', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [], { priority: 'urgent' })
    expect(planDay(input([normal, urgent])).assignments[0].workOrderId).toBe('b')
    const older = order('c', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [], {
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(planDay(input([normal, older])).assignments[0].workOrderId).toBe('c')
  })

  it('ranks urgent above high (and high above normal above low) at equal slack', () => {
    // The high order is older and has the lower number: only its rank loses it the first slot.
    const high = order('a', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [], {
      priority: 'high',
      dueDate: '2026-10-21',
      createdAt: '2026-10-01T00:00:00Z',
    })
    const urgent = order('b', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [], {
      priority: 'urgent',
      dueDate: '2026-10-21',
      createdAt: '2026-10-05T00:00:00Z',
    })
    const first = planDay(input([high, urgent])).assignments
    expect(first[0].workOrderId).toBe('b')
    expect(first[1].workOrderId).toBe('a')

    const low = order('a', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [], { priority: 'low' })
    const normal = order('b', [step('s', { setupMinutes: 60, machineTypeId: 'mt-print' })], [])
    expect(planDay(input([low, normal])).assignments[0].workOrderId).toBe('b')
  })

  it('forms a crew with a qualified lead and any helper', () => {
    const o = order('o1', [step('s1', { setupMinutes: 30, crewSize: 2, machineTypeId: 'mt-print' })], [])
    const result = planDay(input([o]))
    expect(result.assignments[0].userIds).toEqual(['ana', 'boba'])
    expect(result.assignments[0].leadUserId).toBe('ana')
  })

  it('does not use absent workers and reports no_workers when nobody qualified is present', () => {
    const o = order('o1', [step('s1', { setupMinutes: 30, machineTypeId: 'mt-print' })], [])
    const away = worker('ana', ['mt-print'], { [MONDAY]: false })
    const result = planDay(input([o], { workers: [away, worker('boba', ['mt-cut'])] }))
    // Ana is back on Tuesday, so the step moves there.
    expect(result.assignments[0].start.slice(0, 10)).toBe('2026-10-20')
    const nobody = planDay(input([o], { workers: [worker('boba', ['mt-cut'])] }))
    expect(nobody.issues.map((i) => i.code)).toContain('no_workers')
    expect(nobody.forecast[0]).toMatchObject({ unplannable: true, estimatedFinish: null })
  })

  it('reports unknown_machine_type, no_machine and missing_duration', () => {
    const unknown = order('u', [step('s', { setupMinutes: 5, machineTypeId: 'mt-gone' })], [])
    const none = order('n', [step('s', { setupMinutes: 5, machineTypeId: 'mt-print' })], [])
    const noTimes = order('t', [step('s')], [])
    const result = planDay(input([unknown, none, noTimes], { machines: [machine('m-press', 'mt-print', 'Press A', false)] }))
    const codes = result.issues.map((i) => `${i.workOrderId}:${i.code}`)
    expect(codes).toContain('u:unknown_machine_type')
    expect(codes).toContain('n:no_machine')
    expect(codes).toContain('t:missing_duration')
    // A missing duration alone does not make an order unplannable.
    expect(result.forecast.find((f) => f.workOrderId === 't')).toMatchObject({ unplannable: false })
    expect(result.assignments.find((a) => a.workOrderId === 't')?.minutes).toBe(0)
  })

  it('reports no_capacity when the horizon is exhausted and marks the order unplannable', () => {
    const o = order('o1', [step('s1', { setupMinutes: 450 * 3, machineTypeId: 'mt-print' })], [])
    const result = planDay(input([o], { horizonDays: 2 }))
    expect(result.issues.map((i) => i.code)).toContain('no_capacity')
    expect(result.forecast[0].unplannable).toBe(true)
  })

  it('flags late forecasts when the finish is after the due date', () => {
    const o = order('o1', [step('s1', { setupMinutes: 600, machineTypeId: 'mt-print' })], [], { dueDate: '2026-10-19' })
    const forecast = planDay(input([o])).forecast[0]
    expect(forecast).toMatchObject({ estimatedFinish: '2026-10-20', late: true })
  })

  it('leaves finished steps out and places in-progress steps first, locked', () => {
    const o = order(
      'o1',
      [
        step('s1', { status: 'done', setupMinutes: 60 }),
        step('s2', { status: 'in_progress', setupMinutes: 60, machineTypeId: 'mt-print' }),
        step('s3', { status: 'pending', setupMinutes: 30, machineTypeId: 'mt-print' }),
      ],
      [
        ['s1', 's2'],
        ['s2', 's3'],
      ],
    )
    const other = order('o2', [step('s', { setupMinutes: 30, machineTypeId: 'mt-print' })], [], { priority: 'urgent' })
    const result = planDay(input([other, o]))
    const first = result.assignments[0]
    expect(first).toMatchObject({ stepNodeId: 's2', locked: true, start: '2026-10-19T07:00' })
    expect(result.assignments.some((a) => a.stepNodeId === 's1')).toBe(false)
    const s3 = result.assignments.find((a) => a.stepNodeId === 's3')
    expect(s3 && s3.start >= first.end).toBe(true)
  })

  it('starts a re-plan at the given moment and keeps pinned blocks busy', () => {
    const o = order('o1', [step('s1', { setupMinutes: 30, machineTypeId: 'mt-print' })], [])
    const pinned = planDay(input([order('p', [step('s', { setupMinutes: 60, status: 'in_progress', machineTypeId: 'mt-print' })], [])])).assignments
    const result = planDay(input([o], { start: { date: MONDAY, minutes: 8 * 60 }, pinned }))
    expect(result.assignments.find((a) => a.workOrderId === 'o1')?.start).toBe('2026-10-19T08:00')
    // Pinned press block 07:00-08:00 ends exactly at the start.
    const press = planDay(
      input([o], { start: { date: MONDAY, minutes: 7 * 60 + 30 }, pinned }),
    ).assignments.find((a) => a.workOrderId === 'o1')
    expect(press?.start).toBe('2026-10-19T08:00')
  })

  it('returns no blocks on the plan date when it is not a working day but plans ahead', () => {
    const o = order('o1', [step('s1', { setupMinutes: 30, machineTypeId: 'mt-print' })], [])
    const result = planDay(input([o], { date: '2026-10-24' }))
    expect(result.assignments.some((a) => a.start.startsWith('2026-10-24'))).toBe(false)
    expect(result.assignments[0].start.startsWith('2026-10-26')).toBe(true)
  })

  it('is deterministic', () => {
    const o = order('o1', [step('s1', { setupMinutes: 90, machineTypeId: 'mt-print' })], [])
    expect(planDay(input([o]))).toEqual(planDay(input([o])))
  })
})

describe('checkDraft', () => {
  const o = order('o1', [step('s1', { setupMinutes: 30, crewSize: 2, machineTypeId: 'mt-print' })], [])
  const base = planDay(input([o])).assignments[0]
  const ctx = { hours, date: MONDAY, machineTypes: types, machines, workers: input([o]).workers, orders: [o] }

  it('accepts a generated plan', () => {
    expect(checkDraft(ctx, [base])).toEqual([])
  })

  it('reports double booking, outside hours and a short crew', () => {
    const clash = { ...base, id: 'x', workOrderId: 'o2', orderNumber: 'O2' }
    expect(checkDraft(ctx, [base, clash]).some((i) => i.message.includes('zauzet'))).toBe(true)
    expect(checkDraft(ctx, [{ ...base, start: '2026-10-19T05:00', end: '2026-10-19T05:30' }])[0].code).toBe('conflict')
    expect(checkDraft(ctx, [{ ...base, userIds: ['ana'] }]).some((i) => i.message.includes('ekipa'))).toBe(true)
  })

  it('reports a block in a downtime window of its machine', () => {
    // The block runs 07:00-07:30; a window from 07:15 overlaps it, one from 07:30 only touches it.
    const downtimes = [{ id: 'd1', machineId: 'm-press', from: '2026-10-19T07:15', to: '2026-10-19T08:00', createdAt: '' }]
    const issues = checkDraft({ ...ctx, downtimes }, [base])
    expect(issues.some((i) => i.message.includes('van pogona 19.10.2026 07:15 – 19.10.2026 08:00'))).toBe(true)
    expect(checkDraft({ ...ctx, downtimes: [{ ...downtimes[0], from: '2026-10-19T07:30' }] }, [base])).toEqual([])
  })

  it('reports a successor that starts before the inter-operation time elapsed', () => {
    const chained = order(
      'o1',
      [step('s1', { setupMinutes: 60, machineTypeId: 'mt-print' }), step('s2', { setupMinutes: 30, machineTypeId: 'mt-cut' })],
      [['s1', 's2']],
    )
    const lagCtx = { ...ctx, hours: { ...hours, transferMinutes: 30 }, orders: [chained], workers: input([chained]).workers }
    const blocks = planDay({ ...input([chained]), hours: lagCtx.hours }).assignments
    expect(checkDraft(lagCtx, blocks)).toEqual([])
    const early = blocks.map((b) => (b.stepNodeId === 's2' ? { ...b, start: '2026-10-19T08:10', end: '2026-10-19T08:40' } : b))
    expect(checkDraft(lagCtx, early).some((i) => i.message.includes('međuoperacijskog vremena (30 min)'))).toBe(true)
  })
})

describe('computeDrift', () => {
  const o = order('o1', [step('s1', { setupMinutes: 30, machineTypeId: 'mt-print' })], [])
  const block = planDay(input([o])).assignments[0]
  const plan = {
    id: 'p', date: MONDAY, status: 'published' as const, generatedAt: '', generatedBy: '', updatedAt: '', updatedBy: '',
    publishedAt: '', publishedBy: '', assignments: [block], issues: [], lateOrders: [],
  }

  it('suggests a re-plan when a planned step has not started', () => {
    const drift = computeDrift(plan, [o], { date: MONDAY, minutes: 9 * 60 })
    expect(drift.suggested).toBe(true)
    expect(drift.reasons[0]).toContain('O1')
  })

  it('is quiet when on track', () => {
    expect(computeDrift(plan, [o], { date: MONDAY, minutes: 7 * 60 + 5 }).suggested).toBe(false)
  })

  it('suggests a re-plan when a downtime overlaps a planned, unfinished step', () => {
    const downtimes = [{ id: 'd1', machineId: block.machineId ?? '', from: '2026-10-19T07:15', to: '2026-10-19T09:00', createdAt: '' }]
    const drift = computeDrift(plan, [o], { date: MONDAY, minutes: 7 * 60 + 5 }, downtimes)
    expect(drift.suggested).toBe(true)
    expect(drift.reasons[0]).toContain('van pogona')
  })
})

describe('localMoment', () => {
  it('converts an instant to the local date and clock time', () => {
    expect(localMoment(new Date('2026-10-19T22:30:00Z'), 'Europe/Belgrade')).toEqual({ date: '2026-10-20', minutes: 30 })
  })
})
