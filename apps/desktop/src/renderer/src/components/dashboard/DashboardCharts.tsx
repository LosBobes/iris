import type { DashboardSummary } from '@/types/work-order'
import type { ClientCount, DeliveryCount } from '@/lib/dashboard/aggregations'
import { WorkOrdersPerMonthChart } from './charts/WorkOrdersPerMonthChart'
import { StatusDistributionChart } from './charts/StatusDistributionChart'
import { RevenuePerMonthChart } from './charts/RevenuePerMonthChart'
import { DeliveryMethodChart } from './charts/DeliveryMethodChart'
import { TopClientsPanel } from './charts/TopClientsPanel'

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
