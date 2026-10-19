// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import type { Machine, MachineType, PlanAssignment, PlanHorizonDay } from '@/types/planning'
import { DispatchList } from './DispatchList'

const D = '2026-10-20'

function block(id: string, extra: Partial<PlanAssignment> = {}): PlanAssignment {
  return {
    id,
    workOrderId: `wo-${id}`,
    orderNumber: `RN-2026-${id}`,
    clientName: 'Klijent',
    stepNodeId: `s-${id}`,
    stepLabel: 'Štampa',
    machineId: 'm1',
    machineName: 'Heidelberg 1',
    leadUserId: 'u1',
    userIds: ['u1'],
    start: `${D}T08:00`,
    end: `${D}T10:00`,
    minutes: 120,
    part: 1,
    parts: 1,
    locked: false,
    ...extra,
  }
}

const machines: Machine[] = [
  { id: 'm1', name: 'Heidelberg 1', machineTypeId: 'mt1', inService: true, createdAt: '', updatedAt: '' },
  { id: 'm3', name: 'Polar', machineTypeId: 'mt2', inService: true, createdAt: '', updatedAt: '' },
]
const machineTypes: MachineType[] = [
  { id: 'mt1', name: 'Ofset', createdAt: '', updatedAt: '' },
  { id: 'mt2', name: 'Sečenje', createdAt: '', updatedAt: '' },
]
const userNames = new Map([
  ['u1', 'marko'],
  ['u2', 'ana'],
])

// A fixture day plan: two blocks on Heidelberg 1 (listed out of order, one with
// a break inside so minutes < wall-clock span), one on Polar, one without a machine.
const days: PlanHorizonDay[] = [
  {
    date: D,
    assignments: [
      block('2', { stepLabel: 'Lakiranje', start: `${D}T10:30`, end: `${D}T12:00`, minutes: 75, leadUserId: 'u2', userIds: ['u2', 'u1'] }),
      block('1'),
      block('3', { machineId: 'm3', machineName: 'Polar', stepLabel: 'Sečenje', minutes: 45, start: `${D}T09:00`, end: `${D}T09:45`, leadUserId: 'u2', userIds: ['u2'] }),
      block('4', { machineId: null, machineName: '', stepLabel: 'Pakovanje', minutes: 30, start: `${D}T13:00`, end: `${D}T13:30`, parts: 2, part: 1 }),
    ],
  },
]

function renderList(extra: Partial<React.ComponentProps<typeof DispatchList>> = {}) {
  return render(
    <DispatchList
      days={days}
      groupBy="machine"
      status="published"
      firmName="Stamparija Test"
      from={D}
      to={D}
      machines={machines}
      machineTypes={machineTypes}
      userNames={userNames}
      quantities={new Map([['wo-1', 1500], ['wo-2', null]])}
      {...extra}
    />,
  )
}

afterEach(cleanup)

describe('DispatchList', () => {
  it('prints one sheet per machine unit, by type, with people-only steps last', () => {
    renderList()
    const sections = screen.getAllByTestId('dispatch-section')
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual([
      'Mašina: Heidelberg 1',
      'Mašina: Polar',
      'Bez mašine',
    ])
    const first = sections[0]
    expect(first).toHaveTextContent('Stamparija Test')
    expect(first).toHaveTextContent('Radni raspored')
    expect(first).toHaveTextContent('20.10.2026')
    expect(first).toHaveTextContent('objavljen')
    expect(first).toHaveTextContent('Ofset')
  })

  it('lists rows by start with quantity, times, duration and lead, and a daily total', () => {
    renderList()
    const sheet = screen.getAllByTestId('dispatch-section')[0]
    const rows = within(sheet).getAllByRole('row')
    // header, two blocks, total
    expect(rows).toHaveLength(4)
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells(rows[1])).toEqual(['RN-2026-1', 'Štampa', '1.500', '08:00', '10:00', '2:00', 'marko'])
    expect(cells(rows[2])).toEqual(['RN-2026-2', 'Lakiranje', '–', '10:30', '12:00', '1:15', 'ana'])
    expect(within(sheet).getByTestId('dispatch-day-total')).toHaveTextContent('Ukupno za dan3:15')

    const noMachine = screen.getAllByTestId('dispatch-section')[2]
    expect(noMachine).toHaveTextContent('Pakovanje (deo 1/2)')
    expect(within(noMachine).getByTestId('dispatch-day-total')).toHaveTextContent('0:30')
  })

  it('groups by person with a machine column, and dates each day of a range', () => {
    const next = '2026-10-21'
    renderList({
      groupBy: 'person',
      status: 'draft',
      to: next,
      days: [
        ...days,
        { date: next, assignments: [block('5', { start: `${next}T08:00`, end: `${next}T09:00`, minutes: 60 })] },
      ],
    })
    const sections = screen.getAllByTestId('dispatch-section')
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['Radnik: ana', 'Radnik: marko'])
    const marko = sections[1]
    expect(marko).toHaveTextContent('20.10.2026 – 21.10.2026')
    expect(marko).toHaveTextContent('nacrt')
    expect(within(marko).getAllByRole('columnheader', { name: 'Mašina' })).toHaveLength(2)
    const totals = within(marko).getAllByTestId('dispatch-day-total')
    // 20.10: blocks 1 (120), 2 (75) and 4 (30); 21.10: block 5 (60).
    expect(totals.map((row) => row.textContent)).toEqual(['Ukupno za dan3:45', 'Ukupno za dan1:00'])
    expect(within(marko).getByRole('heading', { name: '21.10.2026' })).toBeInTheDocument()
  })

  it('says so when nothing is scheduled', () => {
    renderList({ days: [{ date: D, assignments: [] }] })
    expect(screen.getByText('Za izabrani period nema zakazanih blokova.')).toBeInTheDocument()
  })
})
