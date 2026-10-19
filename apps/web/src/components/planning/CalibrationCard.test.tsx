// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { renderPlanningPage } from '@/test/planning'
import type { PlanningCalibration } from '@/types/planning'
import { CalibrationCard } from './CalibrationCard'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const report: PlanningCalibration = {
  window: { from: '2026-08-21', to: '2026-10-19' },
  orders: 12,
  ordersWithTimes: 9,
  avgTransferMinutes: 35,
  medianTransferMinutes: 30,
  currentTransferMinutes: 0,
  steps: [
    { label: 'Plastifikacija', count: 4, plannedMinutesAvg: 40, actualMinutesAvg: 70.5, ratio: 1.76 },
    { label: 'Sečenje', count: 6, plannedMinutesAvg: 30, actualMinutesAvg: 20, ratio: 0.67 },
    { label: 'Štampa', count: 9, plannedMinutesAvg: 120, actualMinutesAvg: 132, ratio: 1.1 },
  ],
}

function stub(payload: PlanningCalibration) {
  const getPlanningCalibration = vi.fn(async () => payload)
  vi.stubGlobal('api', { getPlanningCalibration })
  return getPlanningCalibration
}

describe('CalibrationCard', () => {
  it('shows the recommended transfer time against the current one and links to the prefilled working hours', async () => {
    const getPlanningCalibration = stub(report)
    renderPlanningPage(<CalibrationCard />)

    const card = await screen.findByRole('region', { name: 'Kalibracija' })
    expect(getPlanningCalibration).toHaveBeenCalledWith({})
    expect(await within(card).findByText('Na osnovu 9 od 12 završenih naloga sa zabeleženim vremenima.')).toBeInTheDocument()
    expect(card).toHaveTextContent('21.08.2026')
    expect(card).toHaveTextContent('19.10.2026')
    expect(within(card).getByText('Preporuka').nextSibling).toHaveTextContent('35 min')
    expect(within(card).getByText('Medijana').nextSibling).toHaveTextContent('30 min')
    expect(within(card).getByText('Trenutno').nextSibling).toHaveTextContent('0 min')

    const link = within(card).getByRole('link', { name: 'Otvori radno vreme sa 35 min' })
    expect(link).toHaveAttribute('href', '/planning/resources?tab=hours&transferMinutes=35')
  })

  it('lists only the step labels that deviate by more than 25%', async () => {
    stub(report)
    renderPlanningPage(<CalibrationCard />)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Plastifikacija')
    expect(rows[0]).toHaveTextContent('70,5')
    expect(rows[0]).toHaveTextContent('1,76×')
    expect(rows[1]).toHaveTextContent('Sečenje')
    expect(within(table).queryByText('Štampa')).not.toBeInTheDocument()
  })

  it('says when the current value already matches and when no step deviates', async () => {
    stub({ ...report, currentTransferMinutes: 35, steps: [report.steps[2]] })
    renderPlanningPage(<CalibrationCard />)

    expect(await screen.findByText('Trenutna vrednost odgovara izmerenoj.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Nijedan korak ne odstupa više od 25 % od planiranog.')).toBeInTheDocument()
  })

  it('explains how times accumulate when nothing is measured yet', async () => {
    stub({ ...report, orders: 3, ordersWithTimes: 0, avgTransferMinutes: null, medianTransferMinutes: null, steps: [] })
    renderPlanningPage(<CalibrationCard />)

    expect(await screen.findByText(/Vremena koraka se beleže kad operateri u „Moj red“/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('has no recommendation without chained measured steps', async () => {
    stub({ ...report, avgTransferMinutes: null, medianTransferMinutes: null })
    renderPlanningPage(<CalibrationCard />)

    expect(await screen.findByText(/Nema naloga sa bar dva uzastopna izmerena koraka/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
