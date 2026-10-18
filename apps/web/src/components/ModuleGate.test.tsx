// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { ModuleGate } from './ModuleGate'
import { sr } from '@/i18n/locales/sr'
import { ALL_MODULES, NO_MODULES, PLANNING_MODULES, STOCK_ONLY, WithModules } from '@/test/modules'
import '@/i18n'

afterEach(cleanup)

function Probe({ onMount }: { onMount: () => void }): React.JSX.Element {
  onMount()
  return <div>module page</div>
}

function renderGate(module: 'stock' | 'processes' | 'planning', modules: typeof ALL_MODULES, onMount = vi.fn()) {
  render(
    <MemoryRouter>
      <WithModules modules={modules}>
        <ModuleGate module={module}>
          <Probe onMount={onMount} />
        </ModuleGate>
      </WithModules>
    </MemoryRouter>,
  )
  return onMount
}

describe('ModuleGate', () => {
  it.each([
    ['stock', NO_MODULES, false],
    ['stock', STOCK_ONLY, true],
    ['stock', ALL_MODULES, true],
    ['processes', NO_MODULES, false],
    ['processes', STOCK_ONLY, false],
    ['processes', ALL_MODULES, true],
    ['planning', NO_MODULES, false],
    ['planning', ALL_MODULES, false],
    ['planning', PLANNING_MODULES, true],
  ] as const)('%s with %j shows the page: %s', (module, modules, visible) => {
    const onMount = renderGate(module, modules)
    if (visible) {
      expect(screen.getByText('module page')).toBeInTheDocument()
      expect(screen.queryByTestId('module-disabled')).not.toBeInTheDocument()
    } else {
      // The page is never mounted, so none of its requests can fire.
      expect(onMount).not.toHaveBeenCalled()
      expect(screen.getByTestId('module-disabled')).toHaveTextContent(sr.modules.disabled.title)
      expect(screen.getByRole('link', { name: sr.modules.disabled.home })).toHaveAttribute('href', '/')
    }
  })
})

describe('ModuleGate planning copy', () => {
  it('explains that Planiranje is not enabled', () => {
    renderGate('planning', ALL_MODULES)
    expect(screen.getByTestId('module-disabled')).toHaveTextContent(sr.modules.disabled.planning)
  })
})
