// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { renderPlanningPage } from '@/test/planning'
import PlanningResourcesPage from './PlanningResourcesPage'

// The calibration card (D-028) links to the working hours with the recommended
// transfer time prefilled; nothing is saved until the admin presses "Sačuvaj".

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const hours = {
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '07:00', end: '15:00', breaks: [{ start: '11:00', end: '11:30' }] })),
  transferMinutes: 0,
  exceptions: [],
}

function stubApi() {
  const api = {
    getWorkingHours: vi.fn(async () => hours),
    setWorkingHours: vi.fn(async (input: unknown) => input),
  }
  vi.stubGlobal('api', api)
  return api
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlanningResourcesPage prefilled from the calibration', () => {
  it('opens the working hours with the suggested transfer time and saves it only on submit', async () => {
    const api = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningResourcesPage />, { path: '/page?tab=hours&transferMinutes=35' })

    const input = await screen.findByLabelText('Međuoperacijsko vreme (min)')
    await waitFor(() => expect(input).toHaveValue(35))
    expect(screen.getByText('Predložena vrednost iz kalibracije: 35 min. Sačuvajte da biste je primenili.')).toBeInTheDocument()
    expect(api.setWorkingHours).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.setWorkingHours).toHaveBeenCalledWith(expect.objectContaining({ transferMinutes: 35 })))
  })

  it('ignores the suggestion for operators and out-of-range values', async () => {
    stubApi()
    renderPlanningPage(<PlanningResourcesPage />, { path: '/page?tab=hours&transferMinutes=35', role: 'user' })
    const input = await screen.findByLabelText('Međuoperacijsko vreme (min)')
    await waitFor(() => expect(input).toHaveValue(0))
    expect(screen.queryByText(/Predložena vrednost iz kalibracije/)).not.toBeInTheDocument()
    cleanup()

    stubApi()
    renderPlanningPage(<PlanningResourcesPage />, { path: '/page?tab=hours&transferMinutes=9999' })
    await waitFor(() => expect(screen.getByLabelText('Međuoperacijsko vreme (min)')).toHaveValue(0))
    expect(screen.queryByText(/Predložena vrednost iz kalibracije/)).not.toBeInTheDocument()
  })
})
