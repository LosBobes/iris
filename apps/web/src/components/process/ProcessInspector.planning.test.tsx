// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { renderWithQueryClient as render } from '@/test/query'
import { ProcessInspector } from './ProcessInspector'
import { sr } from '@/i18n/locales/sr'
import type { ProcessGraph } from '@/types/process'
import '@/i18n'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const text = sr.process.inspector

const graph: ProcessGraph = {
  nodes: [
    { id: 'print', kind: 'step', label: 'Štampa', x: 0, y: 0, machineTypeId: 'mt-offset', crewSize: 2, setupMinutes: 30, minutesPerUnit: 0.5 },
    { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 0, quantity: 1, unit: 'tabak' },
  ],
  edges: [],
}

function renderInspector(props: { planningEnabled?: boolean; canEditStructure?: boolean; id?: string; onNodeChange?: () => void }) {
  const listMachineTypes = vi.fn().mockResolvedValue([
    { id: 'mt-offset', name: 'Offset štampa', createdAt: '', updatedAt: '' },
    { id: 'mt-cutter', name: 'Sečenje', createdAt: '', updatedAt: '' },
  ])
  vi.stubGlobal('api', { listMachineTypes })
  const onNodeChange = props.onNodeChange ?? vi.fn()
  render(
    <ProcessInspector
      graph={graph}
      selection={{ type: 'node', id: props.id ?? 'print' }}
      mode="template"
      canEditStructure={props.canEditStructure ?? true}
      planningEnabled={props.planningEnabled}
      onNodeChange={onNodeChange}
      onEdgeChange={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  return { listMachineTypes, onNodeChange }
}

describe('ProcessInspector planning fields', () => {
  it('hides the fields and never requests machine types while planning is off', () => {
    const { listMachineTypes } = renderInspector({ planningEnabled: false })
    expect(screen.queryByTestId('inspector-planning')).not.toBeInTheDocument()
    expect(listMachineTypes).not.toHaveBeenCalled()
  })

  it('shows machine type, crew, times and the duration hint on a step', async () => {
    const { listMachineTypes } = renderInspector({ planningEnabled: true })
    const section = screen.getByTestId('inspector-planning')
    expect(await within(section).findByText('Offset štampa')).toBeInTheDocument()
    expect(listMachineTypes).toHaveBeenCalledTimes(1)
    expect(within(section).getByLabelText(text.crewSize)).toHaveValue(2)
    expect(within(section).getByLabelText(text.setupMinutes)).toHaveValue(30)
    expect(within(section).getByLabelText(text.minutesPerUnit)).toHaveValue(0.5)
    // 30 + 0.5 x 1 rounds up to 31 minutes.
    expect(screen.getByTestId('inspector-duration')).toHaveTextContent('Trajanje za 1 kom: 31 min')
  })

  it('does not show the fields on item nodes', () => {
    renderInspector({ planningEnabled: true, id: 'paper' })
    expect(screen.queryByTestId('inspector-planning')).not.toBeInTheDocument()
  })

  it('is read-only without structure rights', async () => {
    renderInspector({ planningEnabled: true, canEditStructure: false })
    const section = screen.getByTestId('inspector-planning')
    expect(within(section).getByLabelText(text.crewSize)).toHaveAttribute('readonly')
    expect(within(section).getByLabelText(text.setupMinutes)).toHaveAttribute('readonly')
    expect(within(section).getByLabelText(text.minutesPerUnit)).toHaveAttribute('readonly')
    expect(within(section).getByRole('combobox', { name: text.machineType })).toBeDisabled()
  })

  it('patches the node when a field changes and clamps crew size', async () => {
    const onNodeChange = vi.fn()
    renderInspector({ planningEnabled: true, onNodeChange })
    const crew = screen.getByLabelText(text.crewSize)
    fireEvent.change(crew, { target: { value: '99' } })
    expect(onNodeChange).toHaveBeenLastCalledWith('print', { crewSize: 50 })
    fireEvent.change(crew, { target: { value: '0' } })
    expect(onNodeChange).toHaveBeenLastCalledWith('print', { crewSize: 1 })
    await userEvent.clear(screen.getByLabelText(text.setupMinutes))
    expect(onNodeChange).toHaveBeenLastCalledWith('print', { setupMinutes: undefined })
  })
})
