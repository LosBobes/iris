import { AppShell } from '@/components/layout/AppShell'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { DashboardSummaryCards } from '@/components/dashboard/DashboardSummaryCards'
import { useDashboardData } from '@/hooks/useDashboardData'

function DashboardPage(): React.JSX.Element {
  const { summary, monthlyOrders, operators, filters, setFilters, loading, error } =
    useDashboardData()

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <h1 className="text-base font-semibold">Kontrolna tabla</h1>

        <DashboardFilters filters={filters} setFilters={setFilters} operators={operators} />

        {loading && <p className="text-sm text-muted-foreground">Učitavanje podataka...</p>}

        {!loading && error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <>
            <DashboardSummaryCards summary={summary} />
            <DashboardCharts monthlyOrders={monthlyOrders} summary={summary} />
          </>
        )}
      </div>
    </AppShell>
  )
}

export default DashboardPage
