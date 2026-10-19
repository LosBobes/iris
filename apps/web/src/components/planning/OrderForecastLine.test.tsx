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
  { workOrderId: 'wo-3', orderNumber: 'RN-3', clientName: 'C', dueDate: '2026-10-30', priority: 'normal', estimatedFinish: '2026-10-27', late: false, unplannable: false, latestStart: '2026-10-26', latestStartPassed: false },
  { workOrderId: 'wo-4', orderNumber: 'RN-4', clientName: 'D', dueDate: '2026-10-20', priority: 'urgent', estimatedFinish: '2026-10-22', late: true, unplannable: false, latestStart: '2026-10-16', latestStartPassed: true },
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

  it('shows the latest start in the normal color while it has not passed', async () => {
    vi.stubGlobal('api', { getPlanningForecast: vi.fn(async () => forecast) })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-3" />)
    const line = await screen.findByTestId('order-forecast-line')
    expect(line).toHaveTextContent('Najkasniji početak: 26.10.2026')
    const date = screen.getByTestId('latest-start')
    expect(date).not.toHaveAttribute('data-passed')
    expect(date).not.toHaveClass('text-destructive')
    expect(date).not.toHaveTextContent('prošao')
  })

  it('shows a passed latest start in red', async () => {
    vi.stubGlobal('api', { getPlanningForecast: vi.fn(async () => forecast) })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-4" />)
    const line = await screen.findByTestId('order-forecast-line')
    expect(line).toHaveTextContent('Najkasniji početak: 16.10.2026')
    const date = screen.getByTestId('latest-start')
    expect(date).toHaveAttribute('data-passed', 'true')
    expect(date).toHaveClass('text-destructive')
    expect(date).toHaveTextContent('najkasniji početak je prošao')
  })

  it('omits the latest start when the forecast has none', async () => {
    vi.stubGlobal('api', { getPlanningForecast: vi.fn(async () => forecast) })
    renderPlanningPage(<OrderForecastLine workOrderId="wo-1" />)
    const line = await screen.findByTestId('order-forecast-line')
    expect(line).not.toHaveTextContent('Najkasniji početak')
    expect(screen.queryByTestId('latest-start')).not.toBeInTheDocument()
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
