// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import '@/i18n'
import { DashboardItemBreakdown } from '@/components/dashboard/DashboardItemBreakdown'
import type { CompanyOrder } from '@/lib/dashboard/profit'

afterEach(cleanup)

const empty = { services: [], articles: [] }

function renderBreakdown(companyName: string | null, orders: CompanyOrder[]) {
  return render(
    <MemoryRouter>
      <DashboardItemBreakdown breakdown={empty} companyName={companyName} orders={orders} />
    </MemoryRouter>,
  )
}

describe('DashboardItemBreakdown company orders', () => {
  it('asks for a company when none is selected', () => {
    renderBreakdown(null, [])
    expect(screen.getByText(/Izaberite firmu iznad/)).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('links every order of the selected company to its detail page', () => {
    renderBreakdown('Acme', [
      {
        id: 'wo-1',
        orderNumber: 'RN-7',
        issueDate: '2026-05-03',
        jobDescription: 'Vizitkarte',
        status: 'invoiced',
        revenue: 1200,
        profit: 400,
      },
    ])
    const link = screen.getByRole('link', { name: /RN-7/ })
    expect(link).toHaveAttribute('href', '/work-orders/wo-1')
    expect(link).toHaveTextContent('03.05.2026')
  })
})
