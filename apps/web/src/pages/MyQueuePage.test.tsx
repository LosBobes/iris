// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { assignment, queueItem, renderPlanningPage, today } from '@/test/planning'
import type { WorkOrderProcess } from '@/types/process'
import MyQueuePage from './MyQueuePage'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

const process: WorkOrderProcess = {
  workOrderId: 'wo-1',
  templateId: 't',
  templateName: 'Standard',
  updatedAt: '',
  updatedBy: 'admin',
  graph: {
    nodes: [
      { id: 'step-1', kind: 'step', label: 'Štampa', x: 0, y: 0, start: true, status: 'pending', machineTypeId: 'mt1', crewSize: 2 },
      { id: 'step-x', kind: 'step', label: 'Povez', x: 100, y: 0, status: 'pending' },
      { id: 'in', kind: 'input', label: 'Papir', x: 0, y: 50, quantity: 5, unit: 'tabak', actualQuantity: 4 },
    ],
    edges: [{ id: 'e1', source: 'step-1', target: 'step-x' }],
  },
}

function stubApi(status: 'pending' | 'in_progress' | 'done' = 'pending') {
  const item = queueItem(assignment('1'), { stepStatus: status })
  const second = queueItem(assignment('2', { leadUserId: 'u2', start: `${today()}T10:00`, end: `${today()}T11:00` }), {
    isLead: false,
  })
  const api = {
    getMyQueue: vi.fn(async () => ({ date: today(), publishedAt: '2026-10-18T07:00:00Z', items: [item, second] })),
    listQualifications: vi.fn(async () => [
      { userId: 'u1', username: 'marko', machineTypeIds: [] },
      { userId: 'u2', username: 'jelena', machineTypeIds: [] },
    ]),
    getWorkOrderProcess: vi.fn(async () => structuredClone(process)),
    updateWorkOrderProcess: vi.fn(async (_id: string, input: { graph: WorkOrderProcess['graph'] }) => ({
      ...process,
      graph: input.graph,
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

describe('MyQueuePage', () => {
  it('lists the blocks with order link, machine, crew, lead badge and status', async () => {
    stubApi('in_progress')
    renderPlanningPage(<MyQueuePage />, { role: 'user' })

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const first = rows[0]
    expect(within(first).getByRole('link', { name: 'RN-2026-1' })).toHaveAttribute('href', '/work-orders/wo-1')
    expect(first).toHaveTextContent('08:00–10:00')
    expect(first).toHaveTextContent('Heidelberg 1')
    expect(first).toHaveTextContent('marko, jelena')
    expect(first).toHaveTextContent('Vođa')
    expect(first).toHaveTextContent('U toku')
    expect(rows[1]).not.toHaveTextContent('Vođa')
  })

  it('starts a step by changing only that step status through the process update', async () => {
    const api = stubApi('pending')
    const user = userEvent.setup()
    renderPlanningPage(<MyQueuePage />, { role: 'user' })

    await user.click(await screen.findByRole('button', { name: 'Počni korak Štampa naloga RN-2026-1' }))
    await waitFor(() => expect(api.updateWorkOrderProcess).toHaveBeenCalledTimes(1))
    expect(api.getWorkOrderProcess).toHaveBeenCalledWith('wo-1')

    const [id, input] = api.updateWorkOrderProcess.mock.calls[0]
    expect(id).toBe('wo-1')
    const expected = structuredClone(process.graph)
    expected.nodes[0].status = 'in_progress'
    expect(input.graph).toEqual(expected)
    expect(toastSuccess).toHaveBeenCalledWith('Korak je u toku.')
    // The queue is refetched after the change.
    await waitFor(() => expect(api.getMyQueue.mock.calls.length).toBeGreaterThan(1))
  })

  it('finishes an in-progress step', async () => {
    const api = stubApi('in_progress')
    const user = userEvent.setup()
    renderPlanningPage(<MyQueuePage />, { role: 'user' })

    expect(screen.queryByRole('button', { name: 'Počni korak Štampa naloga RN-2026-1' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Završi korak Štampa naloga RN-2026-1' }))
    await waitFor(() => expect(api.updateWorkOrderProcess).toHaveBeenCalled())
    const graph = api.updateWorkOrderProcess.mock.calls[0][1].graph
    expect(graph.nodes.find((n) => n.id === 'step-1')?.status).toBe('done')
    expect(graph.nodes.find((n) => n.id === 'step-x')?.status).toBe('pending')
  })

  it('offers no actions for a finished step and shows errors of a failed update', async () => {
    const api = stubApi('pending')
    api.updateWorkOrderProcess.mockRejectedValueOnce(new Error('Proces je izmenjen.'))
    const user = userEvent.setup()
    renderPlanningPage(<MyQueuePage />, { role: 'user' })

    await user.click(await screen.findByRole('button', { name: 'Završi korak Štampa naloga RN-2026-1' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Greška pri promeni statusa koraka: Proces je izmenjen.'),
    )
  })

  it('shows an empty message when nothing is published', async () => {
    const api = stubApi()
    api.getMyQueue.mockResolvedValue({ date: today(), publishedAt: null, items: [] })
    renderPlanningPage(<MyQueuePage />, { role: 'user' })
    expect(await screen.findByText('Za ovaj dan nema objavljenog plana.')).toBeInTheDocument()
  })
})
