import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { formatMonthLabel, resolveChartMonths } from './utils'

interface WorkOrdersPerMonthChartProps {
  monthlyOrders: { month: string; count: number }[]
}

// Serbian count noun: "1 nalog", "2 naloga", "14 naloga", "21 nalog".
function workOrderCountNoun(count: number): string {
  const singular = count % 10 === 1 && count % 100 !== 11
  return singular
    ? i18n.t('dashboard.charts.orderNounSingular')
    : i18n.t('dashboard.charts.orderNounPlural')
}

interface MonthTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { label: string; count: number } }>
}

function MonthTooltip({
  active,
  payload,
}: MonthTooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-foreground">{point.label}</div>
      <div className="text-muted-foreground">
        {point.count} {workOrderCountNoun(point.count)}
      </div>
    </div>
  )
}

export function WorkOrdersPerMonthChart({
  monthlyOrders,
}: WorkOrdersPerMonthChartProps): React.JSX.Element {
  const { t } = useTranslation()
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
        {t('dashboard.charts.ordersPerMonth')}
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
            content={<MonthTooltip />}
            cursor={{ fill: 'var(--accent)' }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
