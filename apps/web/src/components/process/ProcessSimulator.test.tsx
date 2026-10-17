// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ProcessSimulator } from './ProcessSimulator'
import { ProcessSimulatorButton } from './ProcessSimulatorButton'
import { installFlowStubs } from '@/test/flow-stubs'
import type { ProcessGraph } from '@/types/process'
import '@/i18n'

installFlowStubs()
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const graph: ProcessGraph = {
  nodes: [
    { id: 'paper', kind: 'input', label: 'Papir', x: 0, y: 0, quantity: 10, unit: 'kg' },
    { id: 'print', kind: 'step', label: 'Štampa', x: 100, y: 0, status: 'pending' },
    { id: 'cut', kind: 'step', label: 'Sečenje', x: 200, y: 0, status: 'pending' },
    { id: 'box', kind: 'product', label: 'Kutija', x: 300, y: 0, quantity: 8, unit: 'kg' },
    { id: 'scrap', kind: 'byproduct', label: 'Otpad', x: 300, y: 100, quantity: 2, unit: 'kg' },
  ],
  edges: [
    { id: 'e1', source: 'paper', target: 'print' },
    { id: 'e2', source: 'print', target: 'cut' },
    { id: 'e3', source: 'cut', target: 'box' },
    { id: 'e4', source: 'cut', target: 'scrap' },
  ],
}

describe('ProcessSimulator', () => {
  it('steps through waves and shows the log and summary', async () => {
    const user = userEvent.setup()
    const copy = JSON.stringify(graph)
    render(<ProcessSimulator graph={graph} />)

    expect(screen.getAllByText('Pokrenite simulaciju ili idite korak po korak.').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    const log = screen.getByRole('list')
    expect(within(log).getByText(/Talas 1: Štampa/)).toBeInTheDocument()
    expect(within(log).getByText(/potrošeno: Papir 10 kg/)).toBeInTheDocument()
    expect(within(log).queryByText(/proizvedeno/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    await user.click(screen.getByRole('button', { name: 'Korak napred' }))

    expect(screen.getByRole('button', { name: 'Korak napred' })).toBeDisabled()
    const summary = screen.getByRole('region', { name: 'Rezime' })
    expect(within(summary).getByText('10 kg')).toBeInTheDocument()
    expect(within(summary).getByText('80%')).toBeInTheDocument()
    expect(JSON.stringify(graph)).toBe(copy)
  })

  it('scales quantities and resets', async () => {
    const user = userEvent.setup()
    render(<ProcessSimulator graph={graph} />)
    const quantity = screen.getByLabelText('Količina')
    await user.clear(quantity)
    await user.type(quantity, '3')
    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    expect(screen.getByText(/potrošeno: Papir 30 kg/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Resetuj' }))
    expect(screen.queryByText(/potrošeno: Papir/)).not.toBeInTheDocument()
  })

  it('auto-plays at the chosen speed, stops at the end and cleans up', () => {
    vi.useFakeTimers()
    render(<ProcessSimulator graph={graph} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pokreni' }))
    expect(screen.getByRole('button', { name: 'Pauza' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.getByText(/Talas 1: Štampa/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pauza' }))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.queryByText(/Talas 2/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '2×' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pokreni' }))
    act(() => {
      vi.advanceTimersByTime(550 * 6)
    })
    expect(screen.getByRole('button', { name: 'Pokreni' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Rezime' })).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips a step and resets playback', async () => {
    const user = userEvent.setup()
    render(<ProcessSimulator graph={graph} />)
    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    await user.click(screen.getByRole('tab', { name: 'Koraci' }))
    await user.click(screen.getByRole('checkbox', { name: 'Preskoči korak Štampa' }))
    await user.click(screen.getByRole('tab', { name: 'Tok' }))
    expect(screen.getByText('Pokrenite simulaciju ili idite korak po korak.', { selector: 'p' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Korak napred' }))
    expect(screen.getByText(/Štampa \(preskočeno\)/)).toBeInTheDocument()
  })

  it('lists tester warnings and highlights the issue nodes', async () => {
    const user = userEvent.setup()
    const flawed: ProcessGraph = {
      nodes: [...graph.nodes, { id: 'lonely', kind: 'input', label: 'Samac', x: 0, y: 200 }],
      edges: graph.edges,
    }
    render(<ProcessSimulator graph={flawed} />)
    await user.click(screen.getByRole('tab', { name: /Testiranje/ }))
    const issue = screen.getByRole('button', { name: /„Samac“ nije povezan ni sa čim/ })
    expect(issue).toHaveAttribute('aria-pressed', 'false')
    await user.click(issue)
    expect(issue).toHaveAttribute('aria-pressed', 'true')
    await user.click(issue)
    expect(issue).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the success state for a sound process', async () => {
    const user = userEvent.setup()
    render(<ProcessSimulator graph={graph} />)
    await user.click(screen.getByRole('tab', { name: 'Testiranje' }))
    expect(screen.getByText('Nema problema')).toBeInTheDocument()
  })

  it('reports hard errors from the validator', async () => {
    const user = userEvent.setup()
    render(<ProcessSimulator graph={{ nodes: [], edges: [] }} />)
    expect(screen.getByRole('button', { name: 'Pokreni' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: /Testiranje/ }))
    expect(screen.getByText('Greške (1)')).toBeInTheDocument()
  })
})

describe('ProcessSimulatorButton', () => {
  it('opens the simulator in a dialog', async () => {
    const user = userEvent.setup()
    render(<ProcessSimulatorButton graph={graph} />)
    await user.click(screen.getByRole('button', { name: 'Simuliraj' }))
    expect(await screen.findByRole('dialog', { name: 'Simulacija procesa' })).toBeInTheDocument()
    expect(await screen.findByTestId('process-simulator')).toBeInTheDocument()
  })

  it('opens in the backoffice shell', async () => {
    const user = userEvent.setup()
    render(<ProcessSimulatorButton graph={graph} variant="backoffice" />)
    await user.click(screen.getByRole('button', { name: 'Simuliraj' }))
    expect(await screen.findByTestId('process-simulator')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('process-simulator')).not.toBeInTheDocument()
  })
})
