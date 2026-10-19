// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { PLANNING_MODULES, renderPlanningPage } from '@/test/planning'
import type { MaterialNeeds } from '@/types/planning'
import PlanningPage from '@/pages/PlanningPage'
import { MaterialNeedsTab } from './MaterialNeedsTab'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const payload: MaterialNeeds = {
  from: '2026-10-21',
  to: '2026-11-01',
  weeks: [
    { start: '2026-10-21', end: '2026-10-25' },
    { start: '2026-10-26', end: '2026-11-01' },
  ],
  items: [
    {
      catalogItemId: 'cat-paper',
      name: 'Papir 70g B1',
      unit: 'tabak',
      onHand: 110,
      reserved: 125,
      available: -15,
      weeks: [20, 100],
      cumulative: [20, 120],
      unplanned: 5,
      shortFromWeek: 1,
    },
    {
      catalogItemId: null,
      name: 'Boja',
      unit: 'kg',
      onHand: null,
      reserved: null,
      available: null,
      weeks: [1, 0],
      cumulative: [1, 1],
      unplanned: 2.5,
      shortFromWeek: null,
    },
  ],
}

describe('MaterialNeedsTab', () => {
  it('renders week columns, the unplanned column and highlights a shortage', async () => {
    const getMaterialNeeds = vi.fn(async () => payload)
    vi.stubGlobal('api', { getMaterialNeeds })
    renderPlanningPage(<MaterialNeedsTab />)

    const table = await screen.findByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Materijal', 'JM', 'Na stanju', 'Rezervisano', 'Raspoloživo', '21.10.–25.10.', '26.10.–01.11.', 'Neplanirano'])
    expect(getMaterialNeeds).toHaveBeenCalledWith({})

    const paper = screen.getByRole('row', { name: /Papir 70g B1/ })
    expect(paper).toHaveAttribute('data-short', 'true')
    expect(within(paper).getByText('Nedostaje')).toBeInTheDocument()
    expect(within(paper).getByRole('link', { name: 'Otvori artikal Papir 70g B1' })).toHaveAttribute('href', '/catalog/cat-paper')
    const cells = within(paper).getAllByRole('cell')
    // unit, on hand, reserved, available, week 1, week 2, unplanned
    expect(cells.map((cell) => cell.textContent)).toEqual(['tabak', '110', '125', '-15', '20', '100', '5'])
    expect(cells[4]).not.toHaveAttribute('data-short-start')
    expect(cells[5]).toHaveAttribute('data-short-start', 'true')
    expect(cells[5]).toHaveAttribute('title', expect.stringContaining('Nedostaje od ove nedelje'))

    const ink = screen.getByRole('row', { name: /Boja/ })
    expect(ink).not.toHaveAttribute('data-short')
    expect(within(ink).queryByRole('link')).not.toBeInTheDocument()
    expect(within(ink).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['kg', '—', '—', '—', '1', '0', '2,5'])
  })

  it('never requests the report while the stock module is off', async () => {
    const getMaterialNeeds = vi.fn(async () => payload)
    vi.stubGlobal('api', { getMaterialNeeds })
    renderPlanningPage(<MaterialNeedsTab />, { modules: { ...PLANNING_MODULES, stock: false } })
    expect(screen.getByRole('status')).toHaveTextContent('Potrebe materijala zahtevaju modul „Magacin“.')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(getMaterialNeeds).not.toHaveBeenCalled()
  })

  it('shows the empty state', async () => {
    vi.stubGlobal('api', { getMaterialNeeds: vi.fn(async () => ({ ...payload, items: [] })) })
    renderPlanningPage(<MaterialNeedsTab />)
    expect(await screen.findByText('Nema potreba za materijalom u izabranom periodu.')).toBeInTheDocument()
  })

  it('is a section of the planning page, offered only with Magacin on', async () => {
    const getMaterialNeeds = vi.fn(async () => payload)
    vi.stubGlobal('api', {
      getPlanDay: vi.fn(async () => ({ date: '2026-10-19', draft: null, published: null, drift: null })),
      getWorkingHours: vi.fn(async () => ({ timeZone: 'Europe/Belgrade', days: [], transferMinutes: 0, exceptions: [] })),
      listMachines: vi.fn(async () => []),
      listQualifications: vi.fn(async () => []),
      getPlanningForecast: vi.fn(async () => []),
      getMaterialNeeds,
    })
    const view = renderPlanningPage(<PlanningPage />)
    const tab = screen.getByRole('tab', { name: 'Potrebe materijala' })
    expect(getMaterialNeeds).not.toHaveBeenCalled()
    await userEvent.click(tab)
    expect(await screen.findByRole('row', { name: /Papir 70g B1/ })).toBeInTheDocument()
    view.unmount()

    renderPlanningPage(<PlanningPage />, { modules: { ...PLANNING_MODULES, stock: false } })
    expect(screen.queryByRole('tab', { name: 'Potrebe materijala' })).not.toBeInTheDocument()
  })
})
