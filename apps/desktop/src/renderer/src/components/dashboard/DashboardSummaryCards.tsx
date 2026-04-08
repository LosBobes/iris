import { Banknote, CheckCircle2, ClipboardList, Clock } from 'lucide-react'
import type { DashboardSummary } from '@/types/work-order'

const formatRsd = (amount: number): string =>
  new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD' }).format(amount)

interface SummaryCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ size?: number; className?: string }>
}

function SummaryCard({ label, value, icon: Icon }: SummaryCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={13} />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-card-foreground">{value}</p>
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
    <div className="grid grid-cols-4 gap-5">
      <SummaryCard
        label="Ukupno radnih naloga"
        value={summary.totalOrders}
        icon={ClipboardList}
      />
      <SummaryCard
        label="Završeni"
        value={summary.statusCounts.completed}
        icon={CheckCircle2}
      />
      <SummaryCard
        label="Aktivni"
        value={summary.statusCounts.active}
        icon={Clock}
      />
      <SummaryCard
        label="Ukupan prihod"
        value={formatRsd(summary.totalRevenue)}
        icon={Banknote}
      />
    </div>
  )
}
