// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { WorkOrderProcessPanel } from './WorkOrderProcessPanel'
import { ApiError } from '@/lib/errors'
import { installFlowStubs } from '@/test/flow-stubs'
import type { ProcessGraph, ProcessTemplate, WorkOrderProcess } from '@/types/process'
import '@/i18n'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

installFlowStubs()

const graph: ProcessGraph = {
  nodes: [
    { id: 'a', kind: 'step', label: 'Priprema', x: 0, y: 0, status: 'done' },
    { id: 'b', kind: 'step', label: 'Štampa', x: 200, y: 0, status: 'pending' },
    { id: 'c', kind: 'step', label: 'Pakovanje', x: 400, y: 0, status: 'pending' },
    { id: 'i', kind: 'input', label: 'Papir', x: 0, y: 120, quantity: 100, unit: 'kom' },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
    { id: 'e3', source: 'i', target: 'b' },
  ],
}

function processOf(g: ProcessGraph): WorkOrderProcess {
  return {
    workOrderId: 'wo-1',
    templateId: 't1',
    templateName: 'Offset štampa',
    graph: g,
    updatedAt: '2026-03-01T10:00:00Z',
    updatedBy: 'marko',
  }
}

const templates: ProcessTemplate[] = [
  { id: 't1', name: 'Offset štampa', description: '', isDefault: true, graph, createdAt: '', updatedAt: '' },
]

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WorkOrderProcessPanel', () => {
  it('shows progress and the ready steps for an order with a process', async () => {
    vi.stubGlobal('api', { getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)) })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure={false} />)

    expect(await screen.findByText('1/3 koraka završeno')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByText('Spremno za rad: Štampa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ukloni proces' })).not.toBeInTheDocument()
  })

  it('previews the process in the simulator without saving anything', async () => {
    const user = userEvent.setup()
    const updateWorkOrderProcess = vi.fn()
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)),
      updateWorkOrderProcess,
    })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />)

    await user.click(await screen.findByRole('button', { name: 'Simuliraj' }))
    expect(await screen.findByTestId('process-simulator')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    expect(updateWorkOrderProcess).not.toHaveBeenCalled()
  })

  it('offers the template picker when the order has no process and applies it', async () => {
    const user = userEvent.setup()
    const applyProcessTemplate = vi.fn().mockResolvedValue(processOf(graph))
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(null),
      getProcessTemplates: vi.fn().mockResolvedValue(templates),
      applyProcessTemplate,
    })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure={false} />)

    expect(await screen.findByText('Ovaj radni nalog nema proces rada.')).toBeInTheDocument()
    const apply = await screen.findByRole('button', { name: 'Primeni' })
    await waitFor(() => expect(apply).toBeEnabled())
    await user.click(apply)

    await waitFor(() => expect(applyProcessTemplate).toHaveBeenCalledWith('wo-1', 't1'))
    expect(await screen.findByText('1/3 koraka završeno')).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('toasts and reloads on a 409 conflict while applying', async () => {
    const user = userEvent.setup()
    const conflict = new ApiError('Radni nalog već ima proces.', { status: 409, url: 'http://x/work-orders/wo-1/process' })
    const getWorkOrderProcess = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(processOf(graph))
    vi.stubGlobal('api', {
      getWorkOrderProcess,
      getProcessTemplates: vi.fn().mockResolvedValue(templates),
      applyProcessTemplate: vi.fn().mockRejectedValue(conflict),
    })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />)

    const apply = await screen.findByRole('button', { name: 'Primeni' })
    await waitFor(() => expect(apply).toBeEnabled())
    await user.click(apply)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Radni nalog već ima proces.'))
    expect(await screen.findByText('1/3 koraka završeno')).toBeInTheDocument()
  })

  it('says so when there are no templates to apply', async () => {
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(null),
      getProcessTemplates: vi.fn().mockResolvedValue([]),
    })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure={false} />)
    expect(await screen.findByText(/Nema definisanih procesa/)).toBeInTheDocument()
  })

  it('lets admins remove the process after confirming', async () => {
    const user = userEvent.setup()
    const deleteWorkOrderProcess = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)),
      getProcessTemplates: vi.fn().mockResolvedValue(templates),
      deleteWorkOrderProcess,
    })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />)

    await user.click(await screen.findByRole('button', { name: 'Ukloni proces' }))
    expect(deleteWorkOrderProcess).not.toHaveBeenCalled()
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ukloni proces' }))

    await waitFor(() => expect(deleteWorkOrderProcess).toHaveBeenCalledWith('wo-1'))
    expect(await screen.findByText('Ovaj radni nalog nema proces rada.')).toBeInTheDocument()
  })

  it('loads the graph lazily and hides structure tools from operators', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('api', { getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)) })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure={false} />)

    expect(screen.queryByRole('group', { name: 'Grafikon procesa' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Prikaži grafikon' }))

    expect(await screen.findByRole('group', { name: 'Grafikon procesa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dodaj korak' })).not.toBeInTheDocument()
    expect(await screen.findByText('Priprema')).toBeInTheDocument()
  })

  it('shows structure tools to admins and disables save until something changes', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('api', { getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)) })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />)

    await user.click(await screen.findByRole('button', { name: 'Prikaži grafikon' }))
    const add = await screen.findByRole('button', { name: 'Dodaj korak' })
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeDisabled()

    await user.click(add)
    expect(await screen.findByText('Nesačuvane izmene')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeEnabled()
  })

  it('saves edits and maps a 403 to the structure message', async () => {
    const user = userEvent.setup()
    const forbidden = new ApiError('x', { status: 403, url: 'http://x/work-orders/wo-1/process' })
    const updateWorkOrderProcess = vi.fn().mockRejectedValue(forbidden)
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)),
      updateWorkOrderProcess,
    })
    render(<WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />)

    await user.click(await screen.findByRole('button', { name: 'Prikaži grafikon' }))
    await user.click(await screen.findByRole('button', { name: 'Dodaj korak' }))
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))

    await waitFor(() => expect(updateWorkOrderProcess).toHaveBeenCalled())
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Samo administrator može menjati strukturu procesa.'),
    )
  })
})
