// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { assignment, plan, renderPlanningPage, today } from '@/test/planning'
import type { PlanDay, ProductionPlan } from '@/types/planning'
import PlanningPage from './PlanningPage'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

const hours = {
  timeZone: 'Europe/Belgrade',
  days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '07:00', end: '15:00', breaks: [] })),
  transferMinutes: 0,
  exceptions: [],
}

interface Store {
  draft: ProductionPlan | null
  published: ProductionPlan | null
  drift: PlanDay['drift']
}

function stubApi(store: Store, admin = true) {
  const api = {
    getPlanDay: vi.fn(async (): Promise<PlanDay> => ({
      date: today(),
      draft: admin ? store.draft : null,
      published: store.published,
      drift: store.drift,
    })),
    getWorkingHours: vi.fn(async () => hours),
    listMachines: vi.fn(async () => [
      { id: 'm1', machineTypeId: 't1', name: 'Heidelberg 1', inService: true, createdAt: '', updatedAt: '' },
      { id: 'm2', machineTypeId: 't1', name: 'Heidelberg 2', inService: true, createdAt: '', updatedAt: '' },
    ]),
    listQualifications: vi.fn(async () => [
      { userId: 'u1', username: 'marko', machineTypeIds: ['t1'] },
      { userId: 'u2', username: 'jelena', machineTypeIds: [] },
    ]),
    getPlanningForecast: vi.fn(async () => [
      {
        workOrderId: 'wo-1',
        orderNumber: 'RN-2026-1',
        clientName: 'Klijent d.o.o.',
        dueDate: '2026-10-30',
        priority: 'high',
        estimatedFinish: '2026-10-21',
        late: false,
        unplannable: false,
      },
      {
        workOrderId: 'wo-2',
        orderNumber: 'RN-2026-2',
        clientName: 'Drugi',
        dueDate: null,
        priority: 'normal',
        estimatedFinish: null,
        late: false,
        unplannable: true,
      },
    ]),
    generatePlan: vi.fn(async () => {
      store.draft = plan('draft', [assignment('1')])
      return store.draft
    }),
    updatePlanDraft: vi.fn(async (input: { assignments: ProductionPlan['assignments'] }) => {
      store.draft = plan('draft', input.assignments)
      return store.draft
    }),
    publishPlan: vi.fn(async () => {
      store.published = plan('published', store.draft?.assignments ?? [])
      store.draft = null
      return store.published
    }),
    deletePlanDraft: vi.fn(async () => {
      store.draft = null
    }),
    getPlanningCalibration: vi.fn(async () => ({
      window: { from: '2026-08-21', to: '2026-10-19' },
      orders: 0,
      ordersWithTimes: 0,
      avgTransferMinutes: null,
      medianTransferMinutes: null,
      currentTransferMinutes: 0,
      steps: [],
    })),
  }
  vi.stubGlobal('api', api)
  return api
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlanningPage (admin)', () => {
  it('generates a draft, shows it on the timeline and publishes it', async () => {
    const store: Store = { draft: null, published: null, drift: null }
    const api = stubApi(store)
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />)

    expect(await screen.findByText(/Za ovaj dan nema plana/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preplaniraj' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generiši plan' }))
    expect(api.generatePlan).toHaveBeenCalledWith({ date: today(), replan: false })
    expect(await screen.findByRole('button', { name: /RN-2026-1, Štampa/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Objavi' }))
    await waitFor(() => expect(api.publishPlan).toHaveBeenCalledWith({ date: today() }))
    expect(await screen.findByRole('tab', { name: 'Objavljeno', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /RN-2026-1, Štampa/ })).toBeInTheDocument()
    // The published plan is on screen, so re-planning is now offered for today.
    expect(screen.getByRole('button', { name: 'Preplaniraj' })).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith('Plan je objavljen.')
  })

  it('edits a block by hand and saves the changed draft', async () => {
    const store: Store = { draft: plan('draft', [assignment('1')]), published: null, drift: null }
    const api = stubApi(store)
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />)

    await user.click(await screen.findByRole('button', { name: /RN-2026-1, Štampa/ }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Mašina'), 'm2')
    const start = within(dialog).getByLabelText('Početak')
    await user.clear(start)
    await user.type(start, '09:30')
    await user.click(within(dialog).getByRole('button', { name: 'Primeni izmenu' }))

    expect(await screen.findByText('Nesačuvane izmene')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Objavi' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }))

    await waitFor(() => expect(api.updatePlanDraft).toHaveBeenCalled())
    const saved = api.updatePlanDraft.mock.calls[0][0]
    expect(saved.date).toBe(today())
    expect(saved.assignments[0]).toMatchObject({
      machineId: 'm2',
      machineName: 'Heidelberg 2',
      start: `${today()}T09:30`,
      end: `${today()}T11:30`,
    })
  })

  it('asks before discarding the draft', async () => {
    const store: Store = { draft: plan('draft', [assignment('1')]), published: null, drift: null }
    const api = stubApi(store)
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />)

    await user.click(await screen.findByRole('button', { name: 'Odbaci nacrt' }))
    expect(api.deletePlanDraft).not.toHaveBeenCalled()
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Odbaci nacrt' }))
    await waitFor(() => expect(api.deletePlanDraft).toHaveBeenCalledWith(today()))
  })

  it('shows the drift banner on today and re-plans from it', async () => {
    const store: Store = {
      draft: null,
      published: plan('published', [assignment('1')]),
      drift: { suggested: true, reasons: ['Nalog RN-2026-9 je kasnio sa početkom'] },
    }
    const api = stubApi(store)
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />)

    const banner = await screen.findByTestId('drift-banner')
    expect(banner).toHaveTextContent('RN-2026-9 je kasnio')
    await user.click(within(banner).getByRole('button', { name: 'Preplaniraj' }))
    await waitFor(() => expect(api.generatePlan).toHaveBeenCalledWith({ date: today(), replan: true }))
  })

  it('lists issues and late orders and the forecast table', async () => {
    const store: Store = {
      draft: null,
      published: plan('published', [assignment('1')], {
        issues: [{ code: 'no_workers', workOrderId: 'wo-3', orderNumber: 'RN-2026-3', stepLabel: 'Povez', message: 'Nema slobodnih radnika.' }],
        lateOrders: [
          { workOrderId: 'wo-4', orderNumber: 'RN-2026-4', clientName: 'Kasni d.o.o.', dueDate: '2026-10-19', priority: 'urgent', estimatedFinish: '2026-10-22', late: true, unplannable: false },
        ],
      }),
      drift: null,
    }
    stubApi(store)
    renderPlanningPage(<PlanningPage />)

    expect(await screen.findByText('Nema slobodnih radnika.')).toBeInTheDocument()
    expect(screen.getByText('Nalozi koji kasne (1)')).toBeInTheDocument()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('21.10.2026')).toBeInTheDocument()
    expect(within(table).getByText('Ne može se planirati')).toBeInTheDocument()
  })

  it('shows the server message when generating fails', async () => {
    const store: Store = { draft: null, published: null, drift: null }
    const api = stubApi(store)
    api.generatePlan.mockRejectedValueOnce(new Error('Nema mašina.'))
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />)

    await user.click(await screen.findByRole('button', { name: 'Generiši plan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Greška pri generisanju plana: Nema mašina.')
  })
})

describe('PlanningPage (operator)', () => {
  it('shows the published plan read-only without actions or draft', async () => {
    const store: Store = {
      draft: plan('draft', [assignment('9')]),
      published: plan('published', [assignment('1')]),
      drift: { suggested: true, reasons: ['x'] },
    }
    stubApi(store, false)
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPage />, { role: 'user' })

    const block = await screen.findByRole('button', { name: /RN-2026-1, Štampa/ })
    expect(screen.queryByRole('button', { name: 'Generiši plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Objavi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Odbaci nacrt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Nacrt' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('drift-banner')).not.toBeInTheDocument()

    await user.click(block)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Primeni izmenu' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('marko', { exact: false })).toBeInTheDocument()
  })
})
