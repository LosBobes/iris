import { describe, expect, it } from 'vitest'
import type { Machine, MachineType, PlanAssignment } from '@/types/planning'
import { addIsoDays, buildDispatchSections, clampRangeEnd, formatDuration, isIsoDate } from './dispatch'

const D = '2026-10-20'

function block(id: string, extra: Partial<PlanAssignment> = {}): PlanAssignment {
  return {
    id,
    workOrderId: `wo-${id}`,
    orderNumber: `RN-${id}`,
    clientName: 'Klijent',
    stepNodeId: `s-${id}`,
    stepLabel: 'Štampa',
    machineId: 'm1',
    machineName: 'Heidelberg 1',
    leadUserId: 'u1',
    userIds: ['u1'],
    start: `${D}T08:00`,
    end: `${D}T09:00`,
    minutes: 60,
    part: 1,
    parts: 1,
    locked: false,
    ...extra,
  }
}

const machine = (id: string, name: string, machineTypeId: string): Machine => ({
  id,
  name,
  machineTypeId,
  inService: true,
  createdAt: '',
  updatedAt: '',
})
const type = (id: string, name: string): MachineType => ({ id, name, createdAt: '', updatedAt: '' })

const lookups = {
  machines: [machine('m1', 'Heidelberg 1', 'mt1'), machine('m2', 'Polar', 'mt2'), machine('m3', 'Atlas', 'mt1')],
  machineTypes: [type('mt1', 'Ofset'), type('mt2', 'Sečenje')],
  userNames: new Map([
    ['u1', 'marko'],
    ['u2', 'ana'],
  ]),
  noMachineLabel: 'Bez mašine',
}

describe('buildDispatchSections', () => {
  it('groups by machine type then unit, people-only steps last, rows by start with day totals', () => {
    const sections = buildDispatchSections(
      [
        {
          date: D,
          assignments: [
            block('a', { start: `${D}T10:00`, end: `${D}T10:45`, minutes: 45 }),
            block('b', { minutes: 60 }),
            block('c', { machineId: 'm2', machineName: 'Polar', minutes: 30 }),
            block('d', { machineId: null, machineName: '', minutes: 20 }),
            block('e', { machineId: 'm3', machineName: 'Atlas', minutes: 15 }),
            block('f', { machineId: 'gone', machineName: 'Stara mašina', minutes: 10 }),
          ],
        },
      ],
      'machine',
      lookups,
    )
    expect(sections.map((s) => [s.groupLabel, s.title])).toEqual([
      ['Ofset', 'Atlas'],
      ['Ofset', 'Heidelberg 1'],
      ['Sečenje', 'Polar'],
      ['', 'Stara mašina'],
      ['', 'Bez mašine'],
    ])
    const heidelberg = sections[1]
    expect(heidelberg.days[0].rows.map((row) => row.id)).toEqual(['b', 'a'])
    expect(heidelberg.days[0].totalMinutes).toBe(105)
    expect(sections[4].noMachine).toBe(true)
  })

  it('groups by person over every crew member, keeping each day separate', () => {
    const next = addIsoDays(D, 1)
    const sections = buildDispatchSections(
      [
        { date: D, assignments: [block('a', { userIds: ['u1', 'u2'], minutes: 90 })] },
        {
          date: next,
          assignments: [block('b', { start: `${next}T08:00`, end: `${next}T08:30`, minutes: 30, userIds: ['u2'] })],
        },
      ],
      'person',
      lookups,
    )
    expect(sections.map((s) => s.title)).toEqual(['ana', 'marko'])
    expect(sections[0].days.map((day) => [day.date, day.totalMinutes])).toEqual([
      [D, 90],
      [next, 30],
    ])
    expect(sections[1].days.map((day) => day.date)).toEqual([D])
  })
})

describe('dispatch helpers', () => {
  it('formats minutes as h:mm', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(75)).toBe('1:15')
    expect(formatDuration(600)).toBe('10:00')
  })

  it('clamps a print range to at most seven days', () => {
    expect(clampRangeEnd(D, null)).toBe(D)
    expect(clampRangeEnd(D, 'nope')).toBe(D)
    expect(clampRangeEnd(D, '2026-10-19')).toBe(D)
    expect(clampRangeEnd(D, '2026-10-22')).toBe('2026-10-22')
    expect(clampRangeEnd(D, '2026-11-30')).toBe('2026-10-26')
  })

  it('validates calendar dates and adds days across months', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-10-31')).toBe(true)
    expect(addIsoDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})
