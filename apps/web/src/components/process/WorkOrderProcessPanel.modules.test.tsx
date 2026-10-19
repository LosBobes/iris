// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithQueryClient } from '@/test/query'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { ALL_MODULES, NO_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import { WorkOrderProcessPanel } from './WorkOrderProcessPanel'
import { installFlowStubs } from '@/test/flow-stubs'
import type { ProcessGraph, WorkOrderProcess } from '@/types/process'
import '@/i18n'

installFlowStubs()

const graph: ProcessGraph = {
  nodes: [
    { id: 'print', kind: 'step', label: 'Štampa', x: 200, y: 0, status: 'pending' },
    { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 120, quantity: 100, unit: 'tabak', catalogItemId: 'cat-4' },
  ],
  edges: [{ id: 'e1', source: 'paper', target: 'print' }],
}
const process: WorkOrderProcess = {
  workOrderId: 'wo-1',
  templateId: 't1',
  templateName: 'Offset štampa',
  graph,
  updatedAt: '2026-03-01T10:00:00Z',
  updatedBy: 'marko',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPanel(modules: typeof ALL_MODULES) {
  const api = {
    getWorkOrderProcess: vi.fn().mockResolvedValue(process),
    getProcessTemplates: vi.fn().mockResolvedValue([]),
    getStockLevels: vi.fn().mockResolvedValue({
      items: [
        {
          catalogItemId: 'cat-4', code: 'A', name: 'Papir 80g A3', unit: 'tabak', isActive: true,
          onHand: 620, reserved: 100, available: 520, minStock: null, low: false, lastMovementAt: null,
        },
      ],
      total: 1,
    }),
  }
  vi.stubGlobal('api', api)
  renderWithQueryClient(
    <MemoryRouter>
      <WithModules modules={modules}>
        <WorkOrderProcessPanel workOrderId="wo-1" canEditStructure />
      </WithModules>
    </MemoryRouter>,
  )
  return api
}

describe('WorkOrderProcessPanel and modules', () => {
  it.each([
    ['off/off', NO_MODULES],
    ['stock only', STOCK_ONLY],
  ])('renders nothing and requests nothing with %s', async (_name, modules) => {
    const api = renderPanel(modules)
    await Promise.resolve()
    expect(screen.queryByTestId('work-order-process')).not.toBeInTheDocument()
    expect(api.getWorkOrderProcess).not.toHaveBeenCalled()
    expect(api.getProcessTemplates).not.toHaveBeenCalled()
    expect(api.getStockLevels).not.toHaveBeenCalled()
  })

  it('shows the process with materials and the auto-posting note when both are on', async () => {
    const api = renderPanel(ALL_MODULES)
    expect(await screen.findByRole('region', { name: 'Materijal' })).toBeInTheDocument()
    expect(screen.getByText('Završavanje koraka automatski skida materijal sa stanja.')).toBeInTheDocument()
    expect(api.getStockLevels).toHaveBeenCalled()
  })

  it('keeps working without stock: no materials, no note, no stock request', async () => {
    const api = renderPanel({ processes: true, stock: false })
    expect(await screen.findByTestId('work-order-process')).toBeInTheDocument()
    expect(await screen.findByText('Offset štampa')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Materijal' })).not.toBeInTheDocument()
    expect(screen.queryByText('Završavanje koraka automatski skida materijal sa stanja.')).not.toBeInTheDocument()
    expect(api.getStockLevels).not.toHaveBeenCalled()
  })
})
