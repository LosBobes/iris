import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DashboardSummary, DeliveryMethod } from '@/types/work-order'
import type { ClientCount, DeliveryCount } from '@/lib/dashboard/aggregations'
import { DELIVERY_METHOD_LABELS } from '@/lib/dashboard/labels'

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

function formatRSD(value: number): string {
  return `${value.toLocaleString('sr-RS')} RSD`
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

interface RevenuePerMonthChartProps {
  monthlyRevenue: { month: string; revenue: number }[]
}

function RevenuePerMonthChart({
  monthlyRevenue,
}: RevenuePerMonthChartProps): React.JSX.Element {
  const last12 = getLast12Months()
  const lookup = new Map(monthlyRevenue.map(({ month, revenue }) => [month, revenue]))
  const data = last12.map((month) => ({
    label: formatMonthLabel(month),
    revenue: lookup.get(month) ?? 0,
  }))

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">Prihod po mesecu</h2>
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
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => [formatRSD(value), 'Prihod']}
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

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

interface DeliveryMethodChartProps {
  deliveryDistribution: DeliveryCount[]
}

function DeliveryMethodChart({
  deliveryDistribution,
}: DeliveryMethodChartProps): React.JSX.Element {
  const data = deliveryDistribution.map(({ method, count }) => ({
    label: DELIVERY_METHOD_LABELS[method as DeliveryMethod],
    count,
  }))

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">
        Metod isporuke
      </h2>
      {data.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nema podataka za prikaz.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              formatter={(value) => [value, 'Nalozi']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="count" fill="#f59e0b" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

interface TopClientsPanelProps {
  topClients: ClientCount[]
}

function TopClientsPanel({ topClients }: TopClientsPanelProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">
        Top klijenti (po broju naloga)
      </h2>
      {topClients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nema podataka za prikaz.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, topClients.length * 36)}>
          <BarChart
            data={topClients.map(({ clientName, count }) => ({ label: clientName, count }))}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={160}
            />
            <Tooltip
              formatter={(value) => [value, 'Nalozi']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="count" fill="#22c55e" radius={[0, 3, 3, 0]} />
          </BarChart>
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
  monthlyRevenue: { month: string; revenue: number }[]
  deliveryDistribution: DeliveryCount[]
  topClients: ClientCount[]
  summary: DashboardSummary
}

export function DashboardCharts({
  monthlyOrders,
  monthlyRevenue,
  deliveryDistribution,
  topClients,
  summary,
}: DashboardChartsProps): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <WorkOrdersPerMonthChart monthlyOrders={monthlyOrders} />
        <StatusDistributionChart summary={summary} />
      </div>
      <div className="grid grid-cols-2 gap-5">
        <RevenuePerMonthChart monthlyRevenue={monthlyRevenue} />
        <DeliveryMethodChart deliveryDistribution={deliveryDistribution} />
      </div>
      <TopClientsPanel topClients={topClients} />
    </div>
  )
}
