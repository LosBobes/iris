import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { DashboardSummary, WorkOrderStatus } from '@/types/work-order'
import { WORK_ORDER_STATUS_LABELS } from '@/lib/dashboard/labels'

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  completed: '#22c55e',
  active: '#3b82f6',
  draft: '#a1a1aa',
  cancelled: '#ef4444',
}

const STATUS_ORDER: WorkOrderStatus[] = ['completed', 'active', 'draft', 'cancelled']

interface StatusDistributionChartProps {
  summary: DashboardSummary
}

export function StatusDistributionChart({
  summary,
}: StatusDistributionChartProps): React.JSX.Element {
  const data = STATUS_ORDER
    .map((status) => ({
      name: WORK_ORDER_STATUS_LABELS[status],
      value: summary.statusCounts[status],
      status,
    }))
    .filter((d) => d.value > 0)

  const hasData = summary.totalOrders > 0

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">Raspodela statusa</h2>
      {!hasData ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nema podataka za prikaz.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={88}
              dataKey="value"
            >
              {data.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
              ))}
            </Pie>
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [value, 'Nalozi']}
              contentStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
