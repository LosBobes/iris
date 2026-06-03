import { ChevronDown } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards";
import type { ClientCount, DeliveryCount } from "@/lib/dashboard/aggregations";
import type { DashboardFilters as DashboardFiltersState, DashboardSummary } from "@/types/work-order";

interface DashboardFinanceSectionProps {
  summary: DashboardSummary;
  monthlyOrders: { month: string; count: number }[];
  monthlyRevenue: { month: string; revenue: number }[];
  deliveryDistribution: DeliveryCount[];
  topClients: ClientCount[];
  operators: string[];
  filters: DashboardFiltersState;
  setFilters: Dispatch<SetStateAction<DashboardFiltersState>>;
  isFilteredEmpty: boolean;
}

export function DashboardFinanceSection({
  summary,
  monthlyOrders,
  monthlyRevenue,
  deliveryDistribution,
  topClients,
  operators,
  filters,
  setFilters,
  isFilteredEmpty,
}: DashboardFinanceSectionProps): React.JSX.Element {
  return (
    <details className="group border-t border-border pt-6">
      <summary className="iris-focusable flex cursor-pointer list-none items-center justify-between gap-4 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Admin
          </div>
          <h2 className="mt-1 text-[20px] font-normal tracking-[-0.3px] text-foreground">
            Finansije i trendovi
          </h2>
        </div>
        <ChevronDown className="h-4 w-4 text-[color:var(--iris-ink-mute)] transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div className="space-y-6 pt-4">
        <DashboardFilters
          filters={filters}
          setFilters={setFilters}
          operators={operators}
        />

        {isFilteredEmpty ? (
          <div className="animate-iris-fade py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nema radnih naloga koji odgovaraju izabranim filterima.
            </p>
          </div>
        ) : (
          <>
            <DashboardSummaryCards summary={summary} />
            <div className="animate-iris-enter" style={{ animationDelay: "120ms" }}>
              <DashboardCharts
                monthlyOrders={monthlyOrders}
                monthlyRevenue={monthlyRevenue}
                deliveryDistribution={deliveryDistribution}
                topClients={topClients}
                summary={summary}
              />
            </div>
          </>
        )}
      </div>
    </details>
  );
}
