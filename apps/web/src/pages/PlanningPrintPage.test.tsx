// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { assignment, plan, renderPlanningPage } from '@/test/planning'
import type { PlanHorizon } from '@/types/planning'
import PlanningPrintPage from './PlanningPrintPage'

const D = '2026-10-20'
const NEXT = '2026-10-21'

function stubApi() {
  const blocks = [
    assignment('1', { start: `${D}T08:00`, end: `${D}T10:00` }),
    assignment('2', { machineId: null, machineName: '', start: `${D}T11:00`, end: `${D}T11:30`, minutes: 30, userIds: ['u2'], leadUserId: 'u2' }),
  ]
  const horizon = (status: 'draft' | 'published'): PlanHorizon => ({
    planId: `plan-${status}`,
    status,
    date: D,
    horizonEnd: '2026-11-06',
    generatedAt: '',
    updatedAt: '',
    days: [
      { date: D, assignments: blocks },
      { date: NEXT, assignments: [assignment('3', { start: `${NEXT}T08:00`, end: `${NEXT}T09:00`, minutes: 60 })] },
      { date: '2026-10-30', assignments: [assignment('4', { start: '2026-10-30T08:00', end: '2026-10-30T09:00' })] },
    ],
    issues: [],
  })
  const api = {
    getPlanDay: vi.fn(async (date: string) => ({
      date,
      draft: null,
      published: plan('published', blocks, { date }),
      drift: null,
    })),
    getPlanHorizon: vi.fn(async (date: string) => ({ date, draft: horizon('draft'), published: horizon('published') })),
    listMachines: vi.fn(async () => [
      { id: 'm1', name: 'Heidelberg 1', machineTypeId: 'mt1', inService: true, createdAt: '', updatedAt: '' },
    ]),
    listMachineTypes: vi.fn(async () => [{ id: 'mt1', name: 'Ofset', createdAt: '', updatedAt: '' }]),
    listQualifications: vi.fn(async () => [
      { userId: 'u1', username: 'marko', machineTypeIds: [] },
      { userId: 'u2', username: 'jelena', machineTypeIds: [] },
    ]),
    getWorkOrderById: vi.fn(async (id: string) => (id === 'wo-1' ? { id, jobDetails: { quantity: 500 } } : null)),
  }
  vi.stubGlobal('api', api)
  return api
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlanningPrintPage', () => {
  it('prints the published day per machine with order quantities for an operator', async () => {
    const api = stubApi()
    renderPlanningPage(<PlanningPrintPage />, { role: 'user', path: `/page?date=${D}&to=${NEXT}` })

    const sections = await screen.findAllByTestId('dispatch-section')
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['Mašina: Heidelberg 1', 'Bez mašine'])
    // Operators cannot read the horizon: the range is ignored.
    expect(api.getPlanHorizon).not.toHaveBeenCalled()
    expect(api.getPlanDay).toHaveBeenCalledWith(D)
    expect(screen.queryByLabelText('Broj dana')).not.toBeInTheDocument()

    const first = within(sections[0])
    expect(await first.findByText('500')).toBeInTheDocument()
    expect(first.getByText('marko')).toBeInTheDocument()
    expect(api.getWorkOrderById).toHaveBeenCalledWith('wo-1')
    expect(api.getWorkOrderById).toHaveBeenCalledWith('wo-2')
    expect(within(sections[1]).getByTestId('dispatch-day-total')).toHaveTextContent('0:30')
  })

  it('switches to one sheet per person', async () => {
    stubApi()
    const user = userEvent.setup()
    renderPlanningPage(<PlanningPrintPage />, { role: 'user', path: `/page?date=${D}` })

    await screen.findAllByTestId('dispatch-section')
    await user.click(screen.getByRole('tab', { name: 'Po radniku' }))
    const sections = screen.getAllByTestId('dispatch-section')
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['Radnik: jelena', 'Radnik: marko'])
  })

  it('reads a multi-day range from the horizon for an admin, clipped to the range', async () => {
    const api = stubApi()
    renderPlanningPage(<PlanningPrintPage />, { role: 'admin', path: `/page?date=${D}&to=${NEXT}&source=draft` })

    const sections = await screen.findAllByTestId('dispatch-section')
    expect(api.getPlanHorizon).toHaveBeenCalledWith(D)
    expect(api.getPlanDay).not.toHaveBeenCalled()
    const heidelberg = sections[0]
    expect(heidelberg).toHaveTextContent('20.10.2026 – 21.10.2026')
    expect(heidelberg).toHaveTextContent('nacrt')
    expect(within(heidelberg).getAllByTestId('dispatch-day-total')).toHaveLength(2)
    expect(heidelberg).not.toHaveTextContent('RN-2026-4')
    expect(screen.getByRole('tab', { name: 'Nacrt' })).toHaveAttribute('aria-selected', 'true')
  })
})
