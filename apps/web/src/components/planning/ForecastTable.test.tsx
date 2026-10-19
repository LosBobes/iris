// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { renderPlanningPage } from '@/test/planning'
import type { OrderForecast } from '@/types/planning'
import { ForecastTable } from './ForecastTable'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const entry = (id: string, extra: Partial<OrderForecast>): OrderForecast => ({
  workOrderId: id,
  orderNumber: id.toUpperCase(),
  clientName: 'Klijent',
  dueDate: '2026-10-30',
  priority: 'normal',
  estimatedFinish: '2026-10-27',
  late: false,
  unplannable: false,
  latestStart: null,
  latestStartPassed: false,
  ...extra,
})

const forecast: OrderForecast[] = [
  entry('rn-1', { latestStart: '2026-10-26' }),
  entry('rn-2', { latestStart: '2026-10-16', latestStartPassed: true, late: true }),
  entry('rn-3', { dueDate: null }),
]

function rowOf(orderNumber: string): HTMLElement {
  const row = screen.getByRole('link', { name: orderNumber }).closest('tr')
  if (!row) throw new Error(`no row for ${orderNumber}`)
  return row
}

describe('ForecastTable latest start (D-028)', () => {
  it('has a "Najkasniji početak" column, red only where the date has passed', async () => {
    vi.stubGlobal('api', { getPlanningForecast: vi.fn(async () => forecast) })
    renderPlanningPage(<ForecastTable />)
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Najkasniji početak' })).toBeInTheDocument()

    const onTime = within(rowOf('RN-1')).getByTestId('latest-start')
    expect(onTime).toHaveTextContent('26.10.2026')
    expect(onTime).not.toHaveClass('text-destructive')
    expect(onTime).not.toHaveAttribute('data-passed')

    const passed = within(rowOf('RN-2')).getByTestId('latest-start')
    expect(passed).toHaveTextContent('16.10.2026')
    expect(passed).toHaveClass('text-destructive')
    expect(passed).toHaveAttribute('data-passed', 'true')
  })

  it('shows a dash without a latest start', async () => {
    vi.stubGlobal('api', { getPlanningForecast: vi.fn(async () => forecast) })
    renderPlanningPage(<ForecastTable />)
    await screen.findByRole('table')
    const row = rowOf('RN-3')
    expect(within(row).queryByTestId('latest-start')).not.toBeInTheDocument()
    expect(row.lastElementChild).toHaveTextContent('—')
  })
})
