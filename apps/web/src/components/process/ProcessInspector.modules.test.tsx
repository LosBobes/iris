// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ProcessInspector } from './ProcessInspector'
import type { ProcessGraph } from '@/types/process'
import '@/i18n'

afterEach(cleanup)

const graph: ProcessGraph = {
  nodes: [{ id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 0, quantity: 1, unit: 'tabak', catalogItemId: 'cat-4' }],
  edges: [],
}

function renderInspector(props: { articleLinking?: boolean; articlesHidden?: boolean }) {
  render(
    <ProcessInspector
      graph={graph}
      selection={{ type: 'node', id: 'paper' }}
      mode="template"
      canEditStructure
      onNodeChange={vi.fn()}
      onEdgeChange={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  )
}

describe('ProcessInspector article section and the stock module', () => {
  it('shows the article picker when stock is on', () => {
    renderInspector({ articleLinking: true })
    expect(screen.getByTestId('inspector-article')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Promeni artikal|Izaberi artikal|artikal/i })).toBeInTheDocument()
  })

  it('hides the whole article section, linked or not, when the stock module is off', () => {
    renderInspector({ articleLinking: false, articlesHidden: true })
    expect(screen.queryByTestId('inspector-article')).not.toBeInTheDocument()
  })
})
