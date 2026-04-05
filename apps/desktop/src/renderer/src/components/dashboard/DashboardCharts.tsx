import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DashboardSummary } from '@/types/work-order'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SR_MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'avg',
  'sep',
  'okt',
  'nov',
  'dec',
] as const

function getLast12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  return `${SR_MONTH_NAMES[parseInt(month) - 1]} '${year.slice(2)}`
}

// ---------------------------------------------------------------------------
// Feature 1.6 – Work Orders per Month
// ---------------------------------------------------------------------------

interface WorkOrdersPerMonthChartProps {
  monthlyOrders: { month: string; count: number }[]
}

function WorkOrdersPerMonthChart({
  monthlyOrders,
}: WorkOrdersPerMonthChartProps): React.JSX.Element {
  const last12 = getLast12Months()
  const lookup = new Map(monthlyOrders.map(({ month, count }) => [month, count]))
  const data = last12.map((month) => ({
    label: formatMonthLabel(month),
    count: lookup.get(month) ?? 0,
  }))

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-medium text-card-foreground">
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
            formatter={(value) => [value, 'Nalozi']}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feature 1.7 – Status Distribution
// ---------------------------------------------------------------------------

const STATUS_COLORS = ['#22c55e', '#f59e0b'] as const

interface StatusDistributionChartProps {
  summary: DashboardSummary
}

function StatusDistributionChart({
  summary,
}: StatusDistributionChartProps): React.JSX.Element {
  const data = [
    { name: 'Završeni', value: summary.completedOrders },
    { name: 'U toku', value: summary.inProgressOrders },
  ]
  const hasData = summary.totalOrders > 0

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-medium text-card-foreground">Raspodela statusa</h2>
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

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

interface DashboardChartsProps {
  monthlyOrders: { month: string; count: number }[]
  summary: DashboardSummary
}

export function DashboardCharts({
  monthlyOrders,
  summary,
}: DashboardChartsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4">
      <WorkOrdersPerMonthChart monthlyOrders={monthlyOrders} />
      <StatusDistributionChart summary={summary} />
    </div>
  )
}
