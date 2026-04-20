import type { DashboardSummary } from '@/types/work-order'

const formatRsd = (amount: number): string =>
  new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD' }).format(amount)

interface SummaryCellProps {
  label: string
  value: string | number
  isLast?: boolean
}

function SummaryCell({ label, value, isLast }: SummaryCellProps): React.JSX.Element {
  return (
    <div
      className={`flex-1 px-6 py-5 ${
        isLast ? '' : 'border-r border-[color:var(--iris-border-soft)]'
      }`}
    >
      <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        {label}
      </div>
      <div className="tnum mt-2 text-[28px] font-normal tracking-[-0.5px] text-foreground">
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
  return (
    <div className="flex border border-border bg-card">
      <SummaryCell label="Ukupno naloga" value={summary.totalOrders} />
      <SummaryCell label="Završeni" value={summary.statusCounts.completed} />
      <SummaryCell label="Aktivni" value={summary.statusCounts.active} />
      <SummaryCell label="Ukupan prihod" value={formatRsd(summary.totalRevenue)} isLast />
    </div>
  )
}
