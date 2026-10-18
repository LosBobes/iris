// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { ALL_MODULES, WithModules } from '@/test/modules'
import { WorkOrderProcessPanel } from './WorkOrderProcessPanel'
import { installFlowStubs } from '@/test/flow-stubs'
import type { ProcessGraph, WorkOrderProcess } from '@/types/process'
import type { StockLevel } from '@/types/stock'
import '@/i18n'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

installFlowStubs()

const graph: ProcessGraph = {
  nodes: [
    { id: 'print', kind: 'step', label: 'Štampa', x: 200, y: 0, status: 'pending' },
    { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 120, quantity: 100, unit: 'tabak', catalogItemId: 'cat-4' },
    { id: 'ink', kind: 'input', label: 'Boja', x: 0, y: 240, quantity: 2, unit: 'kg', catalogItemId: 'cat-5', actualQuantity: 3 },
    { id: 'glue', kind: 'input', label: 'Lepak', x: 0, y: 360, quantity: 1, unit: 'kg' },
  ],
  edges: [
    { id: 'e1', source: 'paper', target: 'print' },
    { id: 'e2', source: 'ink', target: 'print' },
    { id: 'e3', source: 'glue', target: 'print' },
  ],
}

const processOf = (g: ProcessGraph): WorkOrderProcess => ({
  workOrderId: 'wo-1',
  templateId: 't1',
  templateName: 'Offset štampa',
  graph: g,
  updatedAt: '2026-03-01T10:00:00Z',
  updatedBy: 'marko',
})

function level(id: string, name: string, unit: string, onHand: number, reserved: number): StockLevel {
  return {
    catalogItemId: id,
    code: id,
    name,
    unit,
    isActive: true,
    onHand,
    reserved,
    available: onHand - reserved,
    minStock: null,
    low: false,
    lastMovementAt: null,
  }
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <WithModules modules={ALL_MODULES}>
        <WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />
      </WithModules>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WorkOrderProcessPanel material summary', () => {
  it('lists linked inputs and warns about the shortage', async () => {
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)),
      // Paper: 620 on hand, 100 reserved by this order. Ink: 1 on hand, 2 reserved by this order.
      getStockLevels: vi.fn().mockResolvedValue({
        items: [level('cat-4', 'Papir 80g A3', 'tabak', 620, 100), level('cat-5', 'Boja CMYK', 'kg', 1, 2)],
        total: 2,
      }),
    })
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Materijal' })
    const paper = await within(section).findByRole('row', { name: /Papir 80g A3/ })
    // available = 620 - 100 + 100 (own reservation added back); no shortage
    expect(paper).toHaveTextContent('100 tabak')
    expect(paper).toHaveTextContent('620 tabak')
    expect(paper).toHaveTextContent('Dovoljno')

    // ink: actual 3 kg, usable = 1 - 2 + 2 = 1 kg -> short 2 kg
    const ink = within(section).getByRole('row', { name: /Boja CMYK/ })
    expect(ink).toHaveTextContent('3 kg')
    expect(ink).toHaveAttribute('data-short', 'true')
    expect(within(section).getByRole('alert')).toHaveTextContent('Nedovoljno materijala: Boja CMYK (nedostaje 2 kg)')
    expect(within(section).queryByText('Lepak')).not.toBeInTheDocument()
    expect(screen.getByText('Završavanje koraka automatski skida materijal sa stanja.')).toBeInTheDocument()
  })

  it('has no warning when everything is covered and omits the section without linked inputs', async () => {
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)),
      getStockLevels: vi.fn().mockResolvedValue({
        items: [level('cat-4', 'Papir 80g A3', 'tabak', 620, 100), level('cat-5', 'Boja CMYK', 'kg', 20, 2)],
        total: 2,
      }),
    })
    renderPanel()
    const section = await screen.findByRole('region', { name: 'Materijal' })
    await within(section).findByRole('row', { name: /Boja CMYK/ })
    expect(within(section).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refreshes the stock after saving', async () => {
    const user = userEvent.setup()
    const getStockLevels = vi.fn().mockResolvedValue({
      items: [level('cat-4', 'Papir 80g A3', 'tabak', 620, 100), level('cat-5', 'Boja CMYK', 'kg', 20, 2)],
      total: 2,
    })
    const done: ProcessGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === 'print' ? { ...node, status: 'done' as const } : node)),
    }
    vi.stubGlobal('api', {
      getWorkOrderProcess: vi.fn().mockResolvedValue(processOf(graph)),
      updateWorkOrderProcess: vi.fn().mockResolvedValue(processOf(done)),
      getStockLevels,
    })
    renderPanel()
    await screen.findByRole('region', { name: 'Materijal' })
    await waitFor(() => expect(getStockLevels).toHaveBeenCalledTimes(1))

    // Make the draft dirty through the graph editor, then save.
    await user.click(screen.getByRole('button', { name: 'Prikaži grafikon' }))
    await user.click(await screen.findByRole('button', { name: 'Dodaj korak' }))
    await user.click(screen.getByRole('button', { name: 'Sačuvaj' }))

    await waitFor(() => expect(getStockLevels).toHaveBeenCalledTimes(2))
    expect(toastSuccess).toHaveBeenCalled()
  })
})
