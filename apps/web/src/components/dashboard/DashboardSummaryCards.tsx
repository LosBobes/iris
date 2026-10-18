import { useTranslation } from 'react-i18next'
import type { DashboardSummary } from '@/types/work-order'

const formatRsd = (amount: number): string =>
  new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD' }).format(amount)

interface SummaryCellProps {
  label: string
  value: string | number
  isLast?: boolean
  delayMs: number
}

function SummaryCell({ label, value, isLast, delayMs }: SummaryCellProps): React.JSX.Element {
  return (
    <div
      className={`min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-5 ${
        isLast ? '' : 'border-r border-[color:var(--iris-border-soft)]'
      } max-sm:[&:nth-child(2n)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b max-sm:[&:nth-child(-n+2)]:border-[color:var(--iris-border-soft)]`}
      style={{
        animation:
          'iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both',
        animationDelay: `${delayMs}ms`,
      }}
    >
      <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        {label}
      </div>
      <div className="tnum mt-2 break-words text-[22px] font-normal sm:text-[28px] tracking-[-0.5px] text-foreground">
        {value}
      </div>
    </div>
  )
}

interface DashboardSummaryCardsProps {
  summary: DashboardSummary
}

export function DashboardSummaryCards({
  summary,
}: DashboardSummaryCardsProps): React.JSX.Element {
  const { t } = useTranslation()
  const openOrders =
    summary.statusCounts.new +
    summary.statusCounts.assigned +
    summary.statusCounts.inProgress

  return (
    <div className="grid grid-cols-2 border border-border bg-card sm:flex">
      <SummaryCell label={t('dashboard.summary.totalOrders')} value={summary.totalOrders} delayMs={120} />
      <SummaryCell label={t('dashboard.summary.completed')} value={summary.statusCounts.completed} delayMs={180} />
      <SummaryCell label={t('dashboard.summary.open')} value={openOrders} delayMs={240} />
      <SummaryCell
        label={t('dashboard.summary.totalRevenue')}
        value={formatRsd(summary.totalRevenue)}
        isLast
        delayMs={300}
      />
    </div>
  )
}
