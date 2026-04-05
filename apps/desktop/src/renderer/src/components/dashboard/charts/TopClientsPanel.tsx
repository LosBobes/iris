import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ClientCount } from '@/lib/dashboard/aggregations'

interface TopClientsPanelProps {
  topClients: ClientCount[]
}

export function TopClientsPanel({ topClients }: TopClientsPanelProps): React.JSX.Element {
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
