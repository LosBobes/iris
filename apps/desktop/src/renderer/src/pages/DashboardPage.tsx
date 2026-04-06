import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { DashboardSummaryCards } from '@/components/dashboard/DashboardSummaryCards'
import { RevenuePerMonthChart } from '@/components/dashboard/charts/RevenuePerMonthChart'
import { WorkOrdersPerMonthChart } from '@/components/dashboard/charts/WorkOrdersPerMonthChart'
import { useDashboardData } from '@/hooks/useDashboardData'

function DashboardPage(): React.JSX.Element {
  const {
    summary,
    monthlyOrders,
    monthlyRevenue,
    deliveryDistribution,
    topClients,
    operators,
    filters,
    setFilters,
    loading,
    error,
    hasSourceData,
  } = useDashboardData()

  const isFilteredEmpty = !loading && !error && hasSourceData && summary.totalOrders === 0
  const isGlobalEmpty = !loading && !error && !hasSourceData
  const showWidgets = !loading && !error && summary.totalOrders > 0
  const showMockMonthlyCharts = !loading && !error && !hasSourceData

  return (
    <AppShell>
      <div className="space-y-8 p-8">
        <h1 className="text-base font-semibold">Kontrolna tabla</h1>

        <DashboardFilters filters={filters} setFilters={setFilters} operators={operators} />

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Učitavanje podataka...</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
            <p className="text-sm text-destructive">
              Greška pri učitavanju podataka: {error}
            </p>
          </div>
        )}

        {isGlobalEmpty && (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground">
              Nema radnih naloga u bazi podataka.
            </p>
          </div>
        )}

        {showMockMonthlyCharts && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Prikazan je demo pregled mesečnih trendova dok podaci ne budu dostupni.
            </p>
            <div className="grid grid-cols-2 gap-5">
              <WorkOrdersPerMonthChart monthlyOrders={[]} />
              <RevenuePerMonthChart monthlyRevenue={[]} />
            </div>
          </div>
        )}

        {isFilteredEmpty && (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground">
              Nema radnih naloga koji odgovaraju izabranim filterima.
            </p>
          </div>
        )}

        {showWidgets && (
          <>
            <DashboardSummaryCards summary={summary} />
            <DashboardCharts
              monthlyOrders={monthlyOrders}
              monthlyRevenue={monthlyRevenue}
              deliveryDistribution={deliveryDistribution}
              topClients={topClients}
              summary={summary}
            />
          </>
        )}
      </div>
    </AppShell>
  )
}

export default DashboardPage
