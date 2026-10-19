import { describe, expect, it } from 'vitest'
import type { ProcessEdge, ProcessGraph, ProcessNode } from '@/types/process'
import type { WorkingHours } from '@/types/planning'
import { calibrate, calibrationWindow, ordersCompletedIn, processCompletion } from './calibration'
import { createFixtureApi } from '../fixture-api'
import { PLANNING_DISABLED_MESSAGE } from '../modules'

// Mirrors iris-api/internal/planner/calibration_test.go: Monday-Friday
// 07:00-15:00 with an 11:00-11:30 break, Europe/Belgrade (CEST = UTC+2).

const hours: WorkingHours = {
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '07:00', end: '15:00', breaks: [{ start: '11:00', end: '11:30' }] })),
  transferMinutes: 0,
  exceptions: [],
}

function done(id: string, label: string, planned: number, startedAt?: string, finishedAt?: string): ProcessNode {
  return { id, kind: 'step', label, x: 0, y: 0, setupMinutes: planned, status: 'done', startedAt, finishedAt }
}

function chain(...nodes: ProcessNode[]): ProcessGraph {
  const edges: ProcessEdge[] = nodes.slice(1).map((node, i) => ({ id: `e${i}`, source: nodes[i].id, target: node.id }))
  return { nodes, edges }
}

const orderA = chain(
  done('s1', 'Štampa', 60, '2026-10-19T05:00:00Z', '2026-10-19T06:00:00Z'),
  done('s2', 'Plastifikacija', 60, '2026-10-19T06:30:00Z', '2026-10-19T07:30:00Z'),
  done('s3', 'Sečenje', 60, '2026-10-19T08:00:00Z', '2026-10-19T10:00:00Z'),
)

describe('calibrate', () => {
  it('measures the gaps in working time, around the break', () => {
    const out = calibrate(hours, [{ quantity: 1, graph: orderA }])
    expect(out.ordersWithTimes).toBe(1)
    expect(out.avgTransferMinutes).toBe(30)
    expect(out.medianTransferMinutes).toBe(30)
    expect(out.steps[0]).toEqual({ label: 'Sečenje', count: 1, plannedMinutesAvg: 60, actualMinutesAvg: 90, ratio: 1.5 })
  })

  it('averages over orders, excluding nights, and rounds to 5 minutes', () => {
    const b = chain(
      done('s1', 'Štampa', 60, '2026-10-19T12:00:00Z', '2026-10-19T13:00:00Z'),
      done('s2', 'Sečenje', 60, '2026-10-20T06:00:00Z', '2026-10-20T07:00:00Z'),
    )
    const c = chain(
      done('s1', 'Štampa', 30, '2026-10-21T05:00:00Z', '2026-10-21T05:30:00Z'),
      done('s2', 'Štampa', 30, '2026-10-21T05:40:00Z', '2026-10-21T06:10:00Z'),
      done('s3', 'Štampa', 30, '2026-10-21T06:20:00Z', '2026-10-21T06:50:00Z'),
      done('s4', 'Štampa', 30, '2026-10-21T07:10:00Z', '2026-10-21T07:40:00Z'),
    )
    const out = calibrate(hours, [orderA, b, c].map((graph) => ({ quantity: 1, graph })))
    expect(out.avgTransferMinutes).toBe(35)
    expect(out.medianTransferMinutes).toBe(30)
  })

  it('skips orders without times or gaps but still compares their measured steps', () => {
    const single = chain(done('s1', 'Štampa', 60, '2026-10-19T05:00:00Z', '2026-10-19T06:00:00Z'))
    const missing = chain(
      done('s1', 'Štampa', 60, undefined, '2026-10-19T06:00:00Z'),
      done('s2', 'Sečenje', 30, '2026-10-19T07:00:00Z', '2026-10-19T07:45:00Z'),
    )
    const out = calibrate(hours, [single, missing].map((graph) => ({ quantity: 1, graph })))
    expect(out.ordersWithTimes).toBe(1)
    expect(out.avgTransferMinutes).toBeNull()
    expect(out.steps.map((step) => [step.label, step.ratio])).toEqual([
      ['Sečenje', 1.5],
      ['Štampa', 1],
    ])
  })

  it('follows the longest chain of done steps on parallel branches', () => {
    const graph: ProcessGraph = {
      nodes: [
        done('s1', 'Priprema', 60, '2026-10-19T05:00:00Z', '2026-10-19T06:00:00Z'),
        done('s2', 'Štampa', 60, '2026-10-19T06:10:00Z', '2026-10-19T07:10:00Z'),
        done('s3', 'Lakiranje', 120, '2026-10-19T06:00:00Z', '2026-10-19T07:30:00Z'),
        done('s4', 'Pakovanje', 30, '2026-10-19T07:30:00Z', '2026-10-19T08:00:00Z'),
      ],
      edges: [
        { id: 'a', source: 's1', target: 's2' },
        { id: 'b', source: 's1', target: 's3' },
        { id: 'c', source: 's2', target: 's4' },
      ],
    }
    expect(calibrate(hours, [{ quantity: 1, graph }]).avgTransferMinutes).toBe(15)
  })
})

describe('processCompletion and the window', () => {
  it('needs every step done or skipped and a finishedAt', () => {
    expect(processCompletion(orderA)?.toISOString()).toBe('2026-10-19T10:00:00.000Z')
    expect(processCompletion(chain(done('s1', 'Štampa', 60)))).toBeNull()
    expect(processCompletion(chain(done('s1', 'Štampa', 60, undefined, '2026-10-19T06:00:00Z'), { id: 's2', kind: 'step', label: 'X', x: 0, y: 0 }))).toBeNull()
  })

  it('resolves and validates the window', () => {
    expect(calibrationWindow({}, '2026-10-19')).toEqual({ window: { from: '2026-08-21', to: '2026-10-19' } })
    expect(calibrationWindow({ from: '2026-10-10', to: '2026-10-01' }, '2026-10-19')).toMatchObject({ status: 422 })
    expect(calibrationWindow({ from: '2025-01-01' }, '2026-10-19')).toMatchObject({ status: 422 })
    expect(calibrationWindow({ to: 'soon' }, '2026-10-19')).toMatchObject({ status: 400 })
  })

  it('keeps orders completed in the window and drops cancelled ones', () => {
    const localDate = (instant: Date) => instant.toISOString().slice(0, 10)
    const window = { from: '2026-10-01', to: '2026-10-31' }
    const kept = ordersCompletedIn(window, 'UTC', [
      { status: 'completed', quantity: 2, graph: orderA },
      { status: 'cancelled', quantity: 1, graph: orderA },
      { status: 'inProgress', quantity: null, graph: chain(done('s1', 'Štampa', 60, undefined, '2026-09-01T06:00:00Z')) },
    ], localDate)
    expect(kept).toEqual([{ quantity: 2, graph: orderA }])
  })
})

describe('fixture getPlanningCalibration', () => {
  it('is gated on the planning module and answers a well-formed report', async () => {
    const off = createFixtureApi({ modules: { stock: true, processes: true, attendance: true, planning: false } })
    await off.login({ orgSlug: 'demo', username: 'admin', password: 'admin123' })
    await expect(off.getPlanningCalibration()).rejects.toMatchObject({ status: 403, message: PLANNING_DISABLED_MESSAGE })

    const api = createFixtureApi({ modules: { stock: true, processes: true, attendance: true, planning: true } })
    await api.login({ orgSlug: 'demo', username: 'admin', password: 'admin123' })
    const report = await api.getPlanningCalibration({ from: '2026-01-01', to: '2026-01-31' })
    expect(report).toMatchObject({ window: { from: '2026-01-01', to: '2026-01-31' }, orders: 0, ordersWithTimes: 0, avgTransferMinutes: null, steps: [] })
    expect(typeof report.currentTransferMinutes).toBe('number')
    await expect(api.getPlanningCalibration({ from: '2026-02-01', to: '2026-01-01' })).rejects.toMatchObject({ status: 422 })
  })
})
