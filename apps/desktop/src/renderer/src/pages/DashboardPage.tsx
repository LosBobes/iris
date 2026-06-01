import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { DashboardSummaryCards } from '@/components/dashboard/DashboardSummaryCards'
import {
  getMockMonthlyOrders,
  getMockMonthlyRevenue,
} from '@/components/dashboard/charts/mockMonthlyData'
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
      <div className="space-y-8">
        <div
          className="animate-iris-enter border-b border-border px-10 pt-7 pb-5"
        >
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · pregled
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            Kontrolna tabla
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            Sažetak poslovanja
          </div>
        </div>

        <div className="animate-iris-enter px-8" style={{ animationDelay: "60ms" }}>
          <DashboardFilters filters={filters} setFilters={setFilters} operators={operators} />
        </div>

        {loading && (
          <div className="px-8">
            <div
              className="flex items-center justify-center py-20 text-muted-foreground"
              style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
            >
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-sm">Učitavanje podataka...</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-8">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              Greška pri učitavanju podataka: {error}
            </div>
          </div>
        )}

        {isGlobalEmpty && (
          <div className="px-8">
            <div className="animate-iris-fade py-20 text-center">
              <p className="text-sm text-muted-foreground">
                Nema radnih naloga u bazi podataka.
              </p>
            </div>
          </div>
        )}

        {showMockMonthlyCharts && (
          <div
            className="animate-iris-enter space-y-4 px-8"
            style={{ animationDelay: "120ms" }}
          >
            <p className="text-sm text-muted-foreground">
              Prikazan je demo pregled mesečnih trendova dok podaci ne budu dostupni.
            </p>
            <div className="grid grid-cols-2 gap-5">
              <WorkOrdersPerMonthChart monthlyOrders={getMockMonthlyOrders()} />
              <RevenuePerMonthChart monthlyRevenue={getMockMonthlyRevenue()} />
            </div>
          </div>
        )}

        {isFilteredEmpty && (
          <div className="px-8">
            <div className="animate-iris-fade py-20 text-center">
              <p className="text-sm text-muted-foreground">
                Nema radnih naloga koji odgovaraju izabranim filterima.
              </p>
            </div>
          </div>
        )}

        {showWidgets && (
          <div className="space-y-8 px-8">
            <DashboardSummaryCards summary={summary} />
            <div className="animate-iris-enter" style={{ animationDelay: "320ms" }}>
              <DashboardCharts
                monthlyOrders={monthlyOrders}
                monthlyRevenue={monthlyRevenue}
                deliveryDistribution={deliveryDistribution}
                topClients={topClients}
                summary={summary}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default DashboardPage
