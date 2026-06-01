import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { DashboardSummaryCards } from '@/components/dashboard/DashboardSummaryCards'
import { useDashboardData } from '@/hooks/useDashboardData'

function DashboardPage(): React.JSX.Element {
  const {
    summary,
    monthlyOrders,
    monthlyRevenue,
    deliveryDistribution,
    topClients,
    queueSummary,
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
            <div className="grid gap-3 md:grid-cols-5">
              <QueueMetric label="Danas" value={queueSummary.today} />
              <QueueMetric label="Kasni" value={queueSummary.overdue} />
              <QueueMetric label="Čeka klijenta" value={queueSummary.waitingForCustomer} />
              <QueueMetric label="Čeka materijal" value={queueSummary.waitingForMaterials} />
              <QueueMetric label="Nedodeljeni" value={queueSummary.unassigned} />
            </div>
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

function QueueMetric({
  label,
  value,
}: {
  label: string
  value: number
}): React.JSX.Element {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">
        {label}
      </div>
      <div className="tnum mt-1 text-[24px] font-normal text-foreground">{value}</div>
    </div>
  )
}

export default DashboardPage
