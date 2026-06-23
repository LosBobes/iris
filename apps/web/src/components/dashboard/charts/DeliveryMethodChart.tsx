import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DeliveryMethod } from "@/types/work-order";
import type { DeliveryCount } from "@/lib/dashboard/aggregations";
import { getWorkOrderDeliveryLabel } from "@/shared/utils/work-orders";

interface DeliveryMethodChartProps {
  deliveryDistribution: DeliveryCount[];
}

export function DeliveryMethodChart({
  deliveryDistribution,
}: DeliveryMethodChartProps): React.JSX.Element {
  const data = deliveryDistribution.map(({ method, count }) => ({
    label: getWorkOrderDeliveryLabel(method as DeliveryMethod),
    count,
  }));

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
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              horizontal={false}
            />
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
              formatter={(value, _name, item) => [
                value,
                (item?.payload as { label?: string } | undefined)?.label ?? "",
              ]}
              labelFormatter={() => ""}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="count" fill="#f59e0b" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
