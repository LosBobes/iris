// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { renderPlanningPage, today } from '@/test/planning'
import type { PlanDay, WorkstationLoad, WorkstationLoadBlock } from '@/types/planning'
import { formatLoadMinutes, loadBand } from '@/lib/planning/load-view'
import { LoadTab } from './LoadTab'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function block(id: string, date: string, minutes: number): WorkstationLoadBlock {
  return {
    workOrderId: `wo-${id}`,
    orderNumber: `RN-2026-${id}`,
    stepNodeId: 'print',
    stepLabel: 'Štampa',
    machineName: 'Heidelberg',
    start: `${date}T07:00`,
    end: `${date}T12:00`,
    minutes,
    leadUserId: 'u1',
  }
}

// Friday 23.10. and Monday 26.10. are working days; the weekend is off.
const FRI = '2026-10-23'
const MON = '2026-10-26'
const payload: WorkstationLoad = {
  from: FRI,
  to: MON,
  source: 'published',
  days: [FRI, MON],
  machineTypes: [
    {
      id: 't-off',
      name: 'Offset',
      units: [
        {
          id: 'm1',
          name: 'Heidelberg',
          inService: true,
          days: [
            { date: FRI, plannedMinutes: 300, availableMinutes: 450, blocks: [block('1', FRI, 300)] },
            { date: MON, plannedMinutes: 400, availableMinutes: 450, blocks: [block('2', MON, 400)] },
          ],
        },
      ],
      days: [
        { date: FRI, plannedMinutes: 300, availableMinutes: 450 },
        { date: MON, plannedMinutes: 400, availableMinutes: 450 },
      ],
    },
    {
      id: 't-cut',
      name: 'Sečenje',
      units: [
        {
          id: 'm2',
          name: 'Polar',
          inService: false,
          days: [
            { date: FRI, plannedMinutes: 500, availableMinutes: 450, blocks: [block('3', FRI, 500)] },
            { date: MON, plannedMinutes: 0, availableMinutes: 0, blocks: [] },
          ],
        },
      ],
      days: [
        { date: FRI, plannedMinutes: 500, availableMinutes: 450 },
        { date: MON, plannedMinutes: 0, availableMinutes: 0 },
      ],
    },
  ],
  people: [
    {
      userId: 'u1',
      username: 'ana',
      days: [
        { date: FRI, plannedMinutes: 0, availableMinutes: 0, blocks: [] },
        { date: MON, plannedMinutes: 100, availableMinutes: 450, blocks: [block('2', MON, 100)] },
      ],
    },
  ],
}

let getPlanningLoad: ReturnType<typeof vi.fn>

beforeEach(() => {
  getPlanningLoad = vi.fn(async () => payload)
  vi.stubGlobal('api', {
    getPlanningLoad,
    getPlanDay: vi.fn(async (): Promise<PlanDay> => ({ date: today(), draft: null, published: null, drift: null })),
  })
})

function cell(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name })
}

describe('LoadTab', () => {
  it('colours each day by band and hatches days off', async () => {
    const onOpenDay = vi.fn()
    renderPlanningPage(<LoadTab isAdmin today={FRI} onOpenDay={onOpenDay} />)

    // Under 80 % neutral, 80–100 % amber, over 100 % red with "preopterećeno".
    const under = await screen.findByRole('button', { name: /^Offset, 23\.10\.2026: 5:00 od 7:30, 67 %$/ })
    expect(under).toHaveAttribute('data-band', 'under')
    const near = cell(/^Offset, 26\.10\.2026: 6:40 od 7:30, 89 %, skoro puno$/)
    expect(near).toHaveAttribute('data-band', 'near')
    expect(near.querySelector('span')).toHaveClass('bg-amber-600')
    const over = cell(/^Sečenje, 23\.10\.2026: 8:20 od 7:30, 111 %, preopterećeno$/)
    expect(over).toHaveAttribute('data-band', 'over')
    expect(over.querySelector('span')).toHaveClass('bg-destructive')
    expect(under.querySelector('span')).not.toHaveClass('bg-destructive')

    // The weekend is a day off in every row; nothing available and nothing planned is hatched too.
    expect(screen.getByRole('img', { name: 'Offset, 24.10.2026: Neradni dan' })).toHaveAttribute('data-band', 'off')
    expect(screen.getByRole('img', { name: 'ana, 25.10.2026: Neradni dan' })).toHaveAttribute('data-band', 'off')
    expect(screen.getByRole('button', { name: /^ana, 23\.10\.2026: 0:00 od 0:00, odsutan$/ })).toHaveAttribute('data-band', 'off')
    for (const header of screen.getAllByRole('button', { name: 'Otvori dnevni plan za 24.10.2026' })) expect(header).toBeDisabled()

    // Totals per row and the legend.
    const offsetRow = screen.getByRole('row', { name: 'Offset' })
    expect(within(offsetRow).getByText('11:40 / 15:00')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Legenda' })).toHaveTextContent('Preko 100 % (preopterećeno)')

    // Units appear on expanding a type; an out-of-service unit is marked and its idle day hatched.
    await userEvent.click(screen.getByRole('button', { name: 'Prikaži mašine: Sečenje' }))
    expect(screen.getByRole('row', { name: 'Polar' })).toHaveTextContent('van pogona')
    expect(cell(/^Polar, 26\.10\.2026: 0:00 od 0:00, van pogona$/)).toHaveAttribute('data-band', 'off')

    // A bar lists its blocks and opens the day plan.
    await userEvent.click(over)
    expect(await screen.findByText('RN-2026-3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Otvori dnevni plan' }))
    expect(onOpenDay).toHaveBeenCalledWith(FRI)
    expect(getPlanningLoad).toHaveBeenCalledWith({})
  })

  it('opens the day plan from a date header and shows the range', async () => {
    const onOpenDay = vi.fn()
    renderPlanningPage(<LoadTab isAdmin={false} today={FRI} onOpenDay={onOpenDay} />)
    await screen.findByRole('button', { name: /^Offset, 23\.10\.2026/ })
    expect(screen.getByText('23.10.2026 – 26.10.2026')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Otvori dnevni plan za 26.10.2026' })[0])
    expect(onOpenDay).toHaveBeenCalledWith(MON)
    // Operators never see the draft switch.
    expect(screen.queryByRole('tablist', { name: 'Izvor plana' })).toBeNull()
  })
})

describe('load-view helpers', () => {
  it('bands and formats minutes', () => {
    expect(loadBand(359, 450)).toBe('under')
    expect(loadBand(360, 450)).toBe('near')
    expect(loadBand(450, 450)).toBe('near')
    expect(loadBand(451, 450)).toBe('over')
    expect(loadBand(10, 0)).toBe('over')
    expect(loadBand(0, 0)).toBe('off')
    expect(formatLoadMinutes(450)).toBe('7:30')
    expect(formatLoadMinutes(5)).toBe('0:05')
  })
})
