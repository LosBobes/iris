// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { PLANNING_MODULES, renderPlanningPage, today } from '@/test/planning'
import { addDays } from '@/lib/planning/load-view'
import type { PlanDay, WorkstationLoad } from '@/types/planning'
import PlanningPage from './PlanningPage'

// The "Zauzetost" tab of the planning page (D-028).

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubApi() {
  const tomorrow = addDays(today(), 1)
  const load: WorkstationLoad = {
    from: today(),
    to: tomorrow,
    source: 'published',
    days: [today(), tomorrow],
    machineTypes: [
      {
        id: 't1',
        name: 'Offset',
        units: [],
        days: [
          { date: today(), plannedMinutes: 60, availableMinutes: 450 },
          { date: tomorrow, plannedMinutes: 0, availableMinutes: 450 },
        ],
      },
    ],
    people: [],
  }
  const api = {
    getPlanDay: vi.fn(async (date: string): Promise<PlanDay> => ({ date, draft: null, published: null, drift: null })),
    getWorkingHours: vi.fn(async () => ({ timeZone: 'Europe/Belgrade', days: [], transferMinutes: 0, exceptions: [] })),
    listMachines: vi.fn(async () => []),
    listQualifications: vi.fn(async () => []),
    getPlanningForecast: vi.fn(async () => []),
    getPlanningLoad: vi.fn(async () => load),
  }
  vi.stubGlobal('api', api)
  return { api, tomorrow }
}

describe('PlanningPage "Zauzetost" tab', () => {
  it('shows the load and a date header opens that day plan', async () => {
    const { api, tomorrow } = stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />)

    // The load is fetched only once the tab is open.
    expect(api.getPlanningLoad).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('tab', { name: 'Zauzetost' }))
    expect(await screen.findByRole('heading', { name: 'Zauzetost radnih mesta' })).toBeInTheDocument()
    expect(api.getPlanningLoad).toHaveBeenCalledWith({})

    const [y, m, d] = tomorrow.split('-')
    await user.click(screen.getAllByRole('button', { name: `Otvori dnevni plan za ${d}.${m}.${y}` })[0])
    expect(await screen.findByRole('tab', { name: 'Dnevni plan', selected: true })).toBeInTheDocument()
    await waitFor(() => expect(api.getPlanDay).toHaveBeenCalledWith(tomorrow))
  })

  it('has no tab while the planning module is off', async () => {
    stubApi()
    renderPlanningPage(<PlanningPage />, { modules: { ...PLANNING_MODULES, planning: false } })
    expect(await screen.findByRole('heading', { name: 'Plan proizvodnje' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Zauzetost' })).toBeNull()
  })
})
