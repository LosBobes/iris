import { ChevronDown } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardCompanyProfit } from "@/components/dashboard/DashboardCompanyProfit";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { DashboardProfitHero } from "@/components/dashboard/DashboardProfitHero";
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards";
import type { ClientCount, DeliveryCount } from "@/lib/dashboard/aggregations";
import type { CompanyProfit, MonthlyProfit, ProfitTotals } from "@/lib/dashboard/profit";
import type { DashboardFilters as DashboardFiltersState, DashboardSummary } from "@/types/work-order";

interface DashboardFinanceSectionProps {
  summary: DashboardSummary;
  monthlyOrders: { month: string; count: number }[];
  monthlyRevenue: { month: string; revenue: number }[];
  deliveryDistribution: DeliveryCount[];
  topClients: ClientCount[];
  profitTotals: ProfitTotals;
  profitRevenue: number;
  monthlyProfit: MonthlyProfit[];
  companyProfit: CompanyProfit[];
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
  profitTotals,
  profitRevenue,
  monthlyProfit,
  companyProfit,
  operators,
  filters,
  setFilters,
  isFilteredEmpty,
}: DashboardFinanceSectionProps): React.JSX.Element {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Admin
          </div>
          <h2 className="mt-1 text-[22px] font-normal tracking-[-0.3px] text-foreground">
            Finansije i trendovi
          </h2>
        </div>
      </div>

      <DashboardFilters filters={filters} setFilters={setFilters} operators={operators} />

      {isFilteredEmpty ? (
        <div className="animate-iris-fade py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nema radnih naloga koji odgovaraju izabranim filterima.
          </p>
        </div>
      ) : (
        <>
          {/* The two hero finance elements: profit breakdown + per-company profit. */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <DashboardProfitHero
              profit={profitTotals}
              revenue={profitRevenue}
              monthly={monthlyProfit}
            />
            <DashboardCompanyProfit companies={companyProfit} />
          </div>

          {/* Secondary trends, collapsed by default to keep the heroes prominent. */}
          <details className="group border-t border-border pt-4">
            <summary className="iris-focusable flex cursor-pointer list-none items-center justify-between gap-4 py-2 text-[12px] text-[color:var(--iris-ink-soft)]">
              <span>Detaljni pregled (nalozi, isporuka, klijenti)</span>
              <ChevronDown className="h-4 w-4 text-[color:var(--iris-ink-mute)] transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="space-y-6 pt-4">
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
            </div>
          </details>
        </>
      )}
    </section>
  );
}
