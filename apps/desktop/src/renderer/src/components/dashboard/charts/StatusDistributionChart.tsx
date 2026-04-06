import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { DashboardSummary } from '@/types/work-order'

const STATUS_COLORS = ['#22c55e', '#f59e0b'] as const

interface StatusDistributionChartProps {
  summary: DashboardSummary
}

export function StatusDistributionChart({
  summary,
}: StatusDistributionChartProps): React.JSX.Element {
  const data = [
    { name: 'Završeni', value: summary.completedOrders },
    { name: 'U toku', value: summary.inProgressOrders },
  ]
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
              {data.map((_, index) => (
                <Cell key={index} fill={STATUS_COLORS[index]} />
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
