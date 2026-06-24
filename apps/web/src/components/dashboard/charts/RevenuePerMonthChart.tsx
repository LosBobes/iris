import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { formatMonthLabel, formatRSD, formatRevenueAxisTick, resolveChartMonths } from './utils'

interface RevenuePerMonthChartProps {
  monthlyRevenue: { month: string; revenue: number }[]
}

export function RevenuePerMonthChart({
  monthlyRevenue,
}: RevenuePerMonthChartProps): React.JSX.Element {
  const { t } = useTranslation()
  const chartMonths = resolveChartMonths(monthlyRevenue.map(({ month }) => month))
  const revenueLookup = new Map(
    monthlyRevenue.map(({ month, revenue }) => [month, revenue]),
  )
  const data = chartMonths.map((month) => {
    const actualRevenue = revenueLookup.get(month)

    return {
      label: formatMonthLabel(month),
      revenue: actualRevenue ?? 0,
    }
  })

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">{t('dashboard.charts.revenuePerMonth')}</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
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
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={formatRevenueAxisTick}
          />
          <Tooltip
            formatter={(value, _name, item) => [
              formatRSD(Number(value ?? 0)),
              (item?.payload as { label?: string } | undefined)?.label ?? '',
            ]}
            labelFormatter={() => ''}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
