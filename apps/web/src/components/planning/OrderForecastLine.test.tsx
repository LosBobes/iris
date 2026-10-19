// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { PLANNING_MODULES, renderPlanningPage } from '@/test/planning'
import { OrderForecastLine } from './OrderForecastLine'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const forecast = [
  { workOrderId: 'wo-1', orderNumber: 'RN-1', clientName: 'A', dueDate: '2026-10-20', priority: 'high', estimatedFinish: '2026-10-22', late: true, unplannable: false },
  { workOrderId: 'wo-2', orderNumber: 'RN-2', clientName: 'B', dueDate: null, priority: 'normal', estimatedFinish: null, late: false, unplannable: true },
]

describe('OrderForecastLine', () => {
  it('shows the estimated finish of the order with a late badge', async () => {
    const getPlanningForecast = vi.fn(async () => forecast)
    vi.stubGlobal('api', { getPlanningForecast })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-1" />)
    const line = await screen.findByTestId('order-forecast-line')
    expect(line).toHaveTextContent('Procenjeni završetak')
    expect(line).toHaveTextContent('22.10.2026')
    expect(line).toHaveTextContent('Kasni')
  })

  it('marks an unplannable order', async () => {
    vi.stubGlobal('api', { getPlanningForecast: vi.fn(async () => forecast) })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-2" />)
    const line = await screen.findByTestId('order-forecast-line')
    expect(line).toHaveTextContent('Nije moguće proceniti')
    expect(line).toHaveTextContent('Ne može se planirati')
  })

  it('renders nothing for an order the forecast does not cover', async () => {
    const getPlanningForecast = vi.fn(async () => forecast)
    vi.stubGlobal('api', { getPlanningForecast })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-9" />)
    await vi.waitFor(() => expect(getPlanningForecast).toHaveBeenCalled())
    expect(screen.queryByTestId('order-forecast-line')).not.toBeInTheDocument()
  })

  it('never requests the forecast while the planning module is off', async () => {
    const getPlanningForecast = vi.fn(async () => forecast)
    vi.stubGlobal('api', { getPlanningForecast })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-1" />, { modules: { ...PLANNING_MODULES, planning: false } })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(getPlanningForecast).not.toHaveBeenCalled()
    expect(screen.queryByTestId('order-forecast-line')).not.toBeInTheDocument()
  })
})
