import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMonthLabel, resolveChartMonths } from './utils'

interface WorkOrdersPerMonthChartProps {
  monthlyOrders: { month: string; count: number }[]
}

export function WorkOrdersPerMonthChart({
  monthlyOrders,
}: WorkOrdersPerMonthChartProps): React.JSX.Element {
  const chartMonths = resolveChartMonths(monthlyOrders.map(({ month }) => month))
  const ordersLookup = new Map(monthlyOrders.map(({ month, count }) => [month, count]))
  const data = chartMonths.map((month) => {
    return {
      label: formatMonthLabel(month),
      count: ordersLookup.get(month) ?? 0,
    }
  })

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">
        Radni nalozi po mesecu
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            angle={-45}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            formatter={(value, _name, item) => [
              value,
              (item?.payload as { label?: string } | undefined)?.label ?? '',
            ]}
            labelFormatter={() => ''}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
