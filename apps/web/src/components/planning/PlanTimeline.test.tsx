// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { assignment, today } from '@/test/planning'
import { PlanTimeline } from './PlanTimeline'

afterEach(cleanup)

const names = new Map([
  ['u1', 'marko'],
  ['u2', 'jelena'],
])

describe('PlanTimeline', () => {
  it('renders blocks as labelled buttons grouped by machine', async () => {
    const onSelect = vi.fn()
    const first = assignment('1')
    const second = assignment('2', { machineId: 'm2', machineName: 'Polar', start: `${today()}T10:00`, end: `${today()}T11:00` })
    render(<PlanTimeline date={today()} assignments={[first, second]} view="machines" userNames={names} onSelect={onSelect} />)

    expect(screen.getByRole('listitem', { name: 'Heidelberg 1' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Polar' })).toBeInTheDocument()
    const block = screen.getByRole('button', { name: 'RN-2026-1, Štampa, 08:00–10:00, Heidelberg 1' })
    await userEvent.click(block)
    expect(onSelect).toHaveBeenCalledWith(first)
  })

  it('shows a block once per crew member in the people view, with the lead marked', () => {
    render(<PlanTimeline date={today()} assignments={[assignment('1')]} view="people" userNames={names} onSelect={() => {}} />)
    const jelena = screen.getByRole('listitem', { name: 'jelena' })
    const marko = screen.getByRole('listitem', { name: 'marko' })
    expect(within(jelena).getAllByRole('button')).toHaveLength(1)
    expect(within(marko).getAllByRole('button')).toHaveLength(1)
    expect(marko.querySelector('svg.lucide-crown')).not.toBeNull()
    expect(jelena.querySelector('svg.lucide-crown')).toBeNull()
  })

  it('marks locked and carried-over blocks', () => {
    render(
      <PlanTimeline
        date={today()}
        assignments={[assignment('1', { locked: true, part: 2, parts: 3 })]}
        view="machines"
        userNames={names}
        onSelect={() => {}}
      />,
    )
    const block = screen.getByRole('button', { name: /RN-2026-1/ })
    expect(block).toHaveAttribute('data-locked', 'true')
    expect(block).toHaveTextContent('2/3')
  })

  it('positions a block by its time inside the working hours', () => {
    const hours = { timeZone: 'Europe/Belgrade', days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '16:00', breaks: [] })) }
    render(
      <PlanTimeline date={today()} assignments={[assignment('1', { start: `${today()}T12:00`, end: `${today()}T14:00` })]} view="machines" workingHours={hours} userNames={names} onSelect={() => {}} />,
    )
    const block = screen.getByRole('button', { name: /RN-2026-1/ })
    expect(block.style.left).toBe('50%')
    expect(block.style.width).toBe('25%')
  })

  it('shows an empty state without blocks', () => {
    render(<PlanTimeline date={today()} assignments={[]} view="machines" userNames={names} onSelect={() => {}} />)
    expect(screen.getByText('Nema zakazanih blokova.')).toBeInTheDocument()
  })
})
