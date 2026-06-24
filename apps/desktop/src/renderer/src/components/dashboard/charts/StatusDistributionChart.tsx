import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useTranslation } from "react-i18next";
import type { DashboardSummary, WorkOrderStatus } from "@/types/work-order";
import { getWorkOrderStatusLabel } from "@/shared/utils/work-orders";

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  completed: "#22c55e",
  active: "#3b82f6",
  draft: "#a1a1aa",
  cancelled: "#ef4444",
};

const STATUS_ORDER: WorkOrderStatus[] = [
  "completed",
  "active",
  "draft",
  "cancelled",
];

interface StatusDistributionChartProps {
  summary: DashboardSummary;
}

export function StatusDistributionChart({
  summary,
}: StatusDistributionChartProps): React.JSX.Element {
  const { t } = useTranslation();
  const data = STATUS_ORDER.map((status) => ({
    name: getWorkOrderStatusLabel(status),
    value: summary.statusCounts[status],
    status,
  })).filter((d) => d.value > 0);

  const hasData = summary.totalOrders > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-5 text-sm font-medium text-card-foreground">
        {t("dashboard.charts.statusDistribution")}
      </h2>
      {!hasData ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("dashboard.charts.noData")}
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
              formatter={(value, name) => [value, name]}
              contentStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
