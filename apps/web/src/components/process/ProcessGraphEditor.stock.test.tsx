// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ProcessGraphEditor } from './ProcessGraphEditor'
import { installFlowStubs } from '@/test/flow-stubs'
import { toLevelMap } from '@/lib/stock/posting'
import type { ProcessGraph } from '@/types/process'
import type { StockLevel } from '@/types/stock'
import '@/i18n'

installFlowStubs()

const article = {
  id: 'cat-4',
  code: 'ART-2',
  name: 'Papir 80g A3',
  kind: 'article' as const,
  unit: 'tabak',
  purchasePrice: null,
  salePrice: null,
  barcode: null,
  taxGroup: null,
  description: null,
  isActive: true,
}

beforeEach(() => {
  vi.stubGlobal('api', { getCatalogItems: vi.fn().mockResolvedValue({ items: [article], total: 1 }) })
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const base: ProcessGraph = {
  nodes: [
    { id: 's1', kind: 'step', label: 'Štampa', x: 0, y: 0, status: 'pending' },
    { id: 'i1', kind: 'input', label: 'Papir', x: 0, y: 100, quantity: 100, unit: 'kom' },
  ],
  edges: [{ id: 'e1', source: 'i1', target: 's1' }],
}

function level(onHand: number, reserved = 0): StockLevel {
  return {
    catalogItemId: 'cat-4',
    code: 'ART-2',
    name: 'Papir 80g A3',
    unit: 'tabak',
    isActive: true,
    onHand,
    reserved,
    available: onHand - reserved,
    minStock: null,
    low: false,
    lastMovementAt: null,
  }
}

function Harness({
  initial = base,
  canEditStructure = true,
  mode = 'template',
  stock,
  onChange,
}: {
  initial?: ProcessGraph
  canEditStructure?: boolean
  mode?: 'template' | 'order'
  stock?: Record<string, StockLevel>
  onChange?: (graph: ProcessGraph) => void
}): React.JSX.Element {
  const [graph, setGraph] = useState(initial)
  return (
    <ProcessGraphEditor
      mode={mode}
      value={graph}
      canEditStructure={canEditStructure}
      stock={stock}
      articleLinking
      onChange={(next) => {
        setGraph(next)
        onChange?.(next)
      }}
    />
  )
}

describe('ProcessGraphEditor article link', () => {
  it('links an article from the catalog, locks the unit and can unlink again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.click(await screen.findByText('Papir'))
    expect(await screen.findByText('Nije povezano sa artiklom — stanje se ne prati.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Izaberi artikal' }))
    await user.click(await screen.findByRole('button', { name: /Papir 80g A3/ }))

    const linked = (onChange.mock.calls.at(-1)![0] as ProcessGraph).nodes[1]
    expect(linked).toMatchObject({ catalogItemId: 'cat-4', unit: 'tabak' })
    expect(await screen.findByText('Povezano sa artiklom: Papir 80g A3')).toBeInTheDocument()
    expect(screen.getByLabelText('Jedinica')).toHaveAttribute('readonly')

    await user.click(screen.getByRole('button', { name: 'Odveži' }))
    expect((onChange.mock.calls.at(-1)![0] as ProcessGraph).nodes[1].catalogItemId).toBeUndefined()
    expect(screen.getByLabelText('Jedinica')).not.toHaveAttribute('readonly')
  })

  it('hides the picker for operators', async () => {
    render(<Harness mode="order" canEditStructure={false} />)
    fireEvent.click(await screen.findByText('Papir'))
    await screen.findByLabelText('Naziv')
    expect(screen.queryByRole('button', { name: 'Izaberi artikal' })).not.toBeInTheDocument()
  })
})

describe('ProcessNodeCard stock', () => {
  const linked: ProcessGraph = {
    ...base,
    nodes: base.nodes.map((node) => (node.id === 'i1' ? { ...node, catalogItemId: 'cat-4', unit: 'tabak' } : node)),
  }

  it('shows the on-hand line without a badge when stock is enough', async () => {
    render(<Harness initial={linked} stock={toLevelMap([level(620)])} />)
    expect(await screen.findByTestId('node-stock')).toHaveTextContent('Na stanju 620 tabak')
    expect(screen.queryByTestId('node-shortage')).not.toBeInTheDocument()
  })

  it('shows a red shortage badge when the planned quantity exceeds what is available', async () => {
    render(<Harness initial={linked} stock={toLevelMap([level(60)])} />)
    expect(await screen.findByTestId('node-shortage')).toHaveTextContent('nedostaje 40 tabak')
  })

  const orderGraph: ProcessGraph = {
    ...linked,
    nodes: linked.nodes.map((node) => (node.id === 'i1' ? { ...node, actualQuantity: 130 } : node)),
  }

  it('uses actual before planned in order mode and adds the order own reservation back', async () => {
    // onHand 150, 100 reserved by this very order -> 150 usable for 130 actual: fine.
    render(<Harness initial={orderGraph} mode="order" stock={toLevelMap([level(150, 100)])} />)
    expect(await screen.findByTestId('node-stock')).toHaveTextContent('Na stanju 150 tabak')
    expect(screen.queryByTestId('node-shortage')).not.toBeInTheDocument()
  })

  it('flags a shortage against the actual quantity in order mode', async () => {
    render(<Harness initial={orderGraph} mode="order" stock={toLevelMap([level(120, 100)])} />)
    expect(await screen.findByTestId('node-shortage')).toHaveTextContent('nedostaje 10 tabak')
  })

  it('shows nothing stock-related without levels', async () => {
    render(<Harness initial={linked} />)
    await screen.findByText('Papir')
    expect(screen.queryByTestId('node-stock')).not.toBeInTheDocument()
  })
})
