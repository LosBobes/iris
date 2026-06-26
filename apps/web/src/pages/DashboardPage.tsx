import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardActionSection } from '@/components/dashboard/DashboardActionSection'
import { DashboardFinanceSection } from '@/components/dashboard/DashboardFinanceSection'
import { OperatorQueueGrid } from '@/components/dashboard/OperatorQueueGrid'
import { useDashboardData } from '@/hooks/useDashboardData'

function DashboardPage(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    summary,
    monthlyOrders,
    monthlyRevenue,
    deliveryDistribution,
    topClients,
    profitTotals,
    profitRevenue,
    monthlyProfit,
    companyProfit,
    itemProfit,
    selectedCompanyKey,
    setSelectedCompanyKey,
    operatorQueue,
    currentUserName,
    operators,
    filters,
    setFilters,
    clientAttentionRows,
    internalAttentionRows,
    signalCounts,
    activeSignal,
    setActiveSignal,
    showFinance,
    loading,
    error,
    hasSourceData,
  } = useDashboardData()

  const isFilteredEmpty = !loading && !error && hasSourceData && summary.totalOrders === 0
  const isGlobalEmpty = !loading && !error && !hasSourceData
  const showDashboard = !loading && !error && hasSourceData

  return (
    <AppShell>
      <div className="space-y-8">
        <div
          className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10"
        >
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t('dashboard.header.eyebrow')}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {t('nav.dashboard')}
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            {t('dashboard.header.subtitle')}
          </div>
        </div>

        {loading && (
          <div className="px-5 sm:px-8">
            <div
              className="flex items-center justify-center py-20 text-muted-foreground"
              style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
            >
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-sm">{t('dashboard.loading')}</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-5 sm:px-8">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              {t('dashboard.loadError', { error })}
            </div>
          </div>
        )}

        {isGlobalEmpty && (
          <div className="px-5 sm:px-8">
            <div className="animate-iris-fade py-20 text-center">
              <p className="text-sm text-muted-foreground">
                Nema radnih naloga u bazi podataka.
              </p>
            </div>
          </div>
        )}

        {showDashboard && (
          <div className="space-y-8 px-5 pb-8 sm:px-8">
            {/* Operators get a personal at-a-glance grid of their own work. */}
            {!showFinance && (
              <OperatorQueueGrid queue={operatorQueue} username={currentUserName} />
            )}

            {showFinance && (
              <DashboardFinanceSection
                summary={summary}
                monthlyOrders={monthlyOrders}
                monthlyRevenue={monthlyRevenue}
                deliveryDistribution={deliveryDistribution}
                topClients={topClients}
                profitTotals={profitTotals}
                profitRevenue={profitRevenue}
                monthlyProfit={monthlyProfit}
                companyProfit={companyProfit}
                itemProfit={itemProfit}
                selectedCompanyKey={selectedCompanyKey}
                setSelectedCompanyKey={setSelectedCompanyKey}
                operators={operators}
                filters={filters}
                setFilters={setFilters}
                isFilteredEmpty={isFilteredEmpty}
              />
            )}

            <DashboardActionSection
              clientAttentionRows={clientAttentionRows}
              internalAttentionRows={internalAttentionRows}
              signalCounts={signalCounts}
              activeSignal={activeSignal}
              onActiveSignalChange={setActiveSignal}
            />
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default DashboardPage
