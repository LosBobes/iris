// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
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
    {
      id: 'print',
      kind: 'step',
      label: 'Štampa',
      x: 0,
      y: 0,
      status: 'done',
      startedAt: '2026-10-19T06:05:00Z',
      finishedAt: '2026-10-19T07:30:00Z',
    },
    { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 0, quantity: 0.13, unit: 'tabak' },
  ],
  edges: [{ id: 'e1', source: 'paper', target: 'print' }],
}

function renderInspector(props: {
  id?: string
  mode?: 'template' | 'order'
  canEditStructure?: boolean
  canEditTimes?: boolean
  orderQuantityFactor?: number
}) {
  vi.stubGlobal('api', {})
  const onNodeChange = vi.fn()
  render(
    <ProcessInspector
      graph={graph}
      selection={{ type: 'node', id: props.id ?? 'print' }}
      mode={props.mode ?? 'order'}
      canEditStructure={props.canEditStructure ?? false}
      canEditTimes={props.canEditTimes}
      orderQuantityFactor={props.orderQuantityFactor}
      timeZone="Europe/Belgrade"
      onNodeChange={onNodeChange}
      onEdgeChange={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  return { onNodeChange }
}

describe('ProcessInspector actual step times (D-028)', () => {
  it('shows the start and finish read-only in the working-hours zone for operators', () => {
    renderInspector({})
    const section = screen.getByTestId('inspector-step-times')
    expect(within(section).getByTestId('inspector-startedAt')).toHaveTextContent('19.10.2026 08:05')
    expect(within(section).getByTestId('inspector-finishedAt')).toHaveTextContent('19.10.2026 09:30')
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument()
    expect(section).toHaveTextContent('Europe/Belgrade')
  })

  it('lets admins correct the times and sends them back as UTC', () => {
    const { onNodeChange } = renderInspector({ canEditStructure: true, canEditTimes: true })
    const started = screen.getByLabelText(text.startedAt) as HTMLInputElement
    expect(started.value).toBe('2026-10-19T08:05')
    fireEvent.change(started, { target: { value: '2026-10-19T07:00' } })
    expect(onNodeChange).toHaveBeenCalledWith('print', { startedAt: '2026-10-19T05:00:00Z' })
    fireEvent.change(screen.getByLabelText(text.finishedAt), { target: { value: '' } })
    expect(onNodeChange).toHaveBeenCalledWith('print', { finishedAt: undefined })
  })

  it('does not show step times on templates or on item nodes', () => {
    renderInspector({ mode: 'template' })
    expect(screen.queryByTestId('inspector-step-times')).not.toBeInTheDocument()
    cleanup()
    renderInspector({ id: 'paper' })
    expect(screen.queryByTestId('inspector-step-times')).not.toBeInTheDocument()
  })
})

describe('ProcessInspector per-unit quantities (D-028)', () => {
  it('explains that the planned quantity is per unit and shows the amount for the order', () => {
    renderInspector({ id: 'paper', orderQuantityFactor: 5000 })
    const hint = screen.getByTestId('inspector-quantity-hint')
    expect(hint).toHaveTextContent(text.quantityPerUnit)
    expect(hint).toHaveTextContent('Za nalog (5000 kom): 650 tabak')
    expect(screen.getByText(text.actualQuantityHint)).toBeInTheDocument()
  })

  it('shows only the per-unit note on a template', () => {
    renderInspector({ id: 'paper', mode: 'template', canEditStructure: true })
    const hint = screen.getByTestId('inspector-quantity-hint')
    expect(hint).toHaveTextContent(text.quantityPerUnit)
    expect(hint).not.toHaveTextContent('Za nalog')
  })
})
