// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ProcessGraphEditor } from './ProcessGraphEditor'
import { installFlowStubs } from '@/test/flow-stubs'
import type { ProcessGraph } from '@/types/process'
import '@/i18n'

installFlowStubs()
afterEach(cleanup)

const base: ProcessGraph = {
  nodes: [
    { id: 's1', kind: 'step', label: 'Štampa', x: 0, y: 0, status: 'pending' },
    { id: 'i1', kind: 'input', label: 'Papir', x: 0, y: 100, quantity: 10, unit: 'kg' },
  ],
  edges: [{ id: 'e1', source: 'i1', target: 's1' }],
}

function Harness({
  initial = base,
  canEditStructure = true,
  mode = 'template',
  onChange,
}: {
  initial?: ProcessGraph
  canEditStructure?: boolean
  mode?: 'template' | 'order'
  onChange?: (graph: ProcessGraph) => void
}): React.JSX.Element {
  const [graph, setGraph] = useState(initial)
  return (
    <ProcessGraphEditor
      mode={mode}
      value={graph}
      canEditStructure={canEditStructure}
      onChange={(next) => {
        setGraph(next)
        onChange?.(next)
      }}
    />
  )
}

describe('ProcessGraphEditor', () => {
  it('adds a node of each kind from the toolbar and selects it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Dodaj proizvod' }))

    const next = onChange.mock.calls.at(-1)![0] as ProcessGraph
    expect(next.nodes).toHaveLength(3)
    expect(next.nodes.at(-1)).toMatchObject({ kind: 'product', label: 'Novi proizvod' })
    expect(await screen.findByLabelText('Naziv')).toHaveValue('Novi proizvod')
  })

  it('edits and deletes the selected node together with its edges', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    // userEvent's mousedown has no `view`, which d3-drag (React Flow) requires.
    fireEvent.click(await screen.findByText('Papir'))
    const label = await screen.findByLabelText('Naziv')
    await user.clear(label)
    await user.type(label, 'Karton')
    expect((onChange.mock.calls.at(-1)![0] as ProcessGraph).nodes[1].label).toBe('Karton')

    await user.click(screen.getByRole('button', { name: 'Obriši čvor' }))
    const after = onChange.mock.calls.at(-1)![0] as ProcessGraph
    expect(after.nodes.map((node) => node.id)).toEqual(['s1'])
    expect(after.edges).toEqual([])
  })

  it('marks a step as a starting step and offers the role for items', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    // userEvent's mousedown has no `view`, which d3-drag (React Flow) requires.
    fireEvent.click(await screen.findByText('Štampa'))
    expect(screen.queryByLabelText('Uloga')).not.toBeInTheDocument()
    await user.click(await screen.findByLabelText('Početni korak'))
    expect((onChange.mock.calls.at(-1)![0] as ProcessGraph).nodes[0].start).toBe(true)
    expect(await screen.findByTestId('node-start')).toHaveTextContent('Početak')

    fireEvent.click(screen.getByText('Papir'))
    expect(await screen.findByLabelText('Uloga')).toBeInTheDocument()
    expect(screen.queryByLabelText('Krajnji izlaz')).not.toBeInTheDocument()
  })

  it('shows validation errors inline', () => {
    render(<Harness initial={{ nodes: [], edges: [] }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Proces mora imati bar jedan korak.')
  })

  it('keeps structure read-only without edit rights but allows state edits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness mode="order" canEditStructure={false} onChange={onChange} />)

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    // userEvent's mousedown has no `view`, which d3-drag (React Flow) requires.
    fireEvent.click(await screen.findByText('Papir'))
    expect(await screen.findByLabelText('Naziv')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Planirana količina')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Obriši čvor' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Uloga')).not.toBeInTheDocument()

    const actual = screen.getByLabelText('Stvarna količina')
    await user.type(actual, '7')
    expect((onChange.mock.calls.at(-1)![0] as ProcessGraph).nodes[1].actualQuantity).toBe(7)
  })
})
