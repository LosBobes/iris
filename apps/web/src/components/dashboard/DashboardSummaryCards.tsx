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
      className={`flex-1 px-6 py-5 ${
        isLast ? '' : 'border-r border-[color:var(--iris-border-soft)]'
      }`}
      style={{
        animation:
          'iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both',
        animationDelay: `${delayMs}ms`,
      }}
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
  const openOrders =
    summary.statusCounts.new +
    summary.statusCounts.assigned +
    summary.statusCounts.inProgress +
    summary.statusCounts.waitingForCustomer +
    summary.statusCounts.waitingForMaterials

  return (
    <div className="flex border border-border bg-card">
      <SummaryCell label="Ukupno naloga" value={summary.totalOrders} delayMs={120} />
      <SummaryCell label="Završeni" value={summary.statusCounts.completed} delayMs={180} />
      <SummaryCell label="Otvoreni" value={openOrders} delayMs={240} />
      <SummaryCell
        label="Ukupan prihod"
        value={formatRsd(summary.totalRevenue)}
        isLast
        delayMs={300}
      />
    </div>
  )
}
