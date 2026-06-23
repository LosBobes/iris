import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardCompanyProfit } from "@/components/dashboard/DashboardCompanyProfit";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { DashboardItemBreakdown } from "@/components/dashboard/DashboardItemBreakdown";
import { DashboardProfitHero } from "@/components/dashboard/DashboardProfitHero";
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards";
import type { ClientCount, DeliveryCount } from "@/lib/dashboard/aggregations";
import type {
  CompanyProfit,
  ItemProfitBreakdown,
  MonthlyProfit,
  ProfitTotals,
} from "@/lib/dashboard/profit";
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
  itemProfit: ItemProfitBreakdown;
  selectedCompanyKey: string | null;
  setSelectedCompanyKey: (key: string | null) => void;
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
  itemProfit,
  selectedCompanyKey,
  setSelectedCompanyKey,
  operators,
  filters,
  setFilters,
  isFilteredEmpty,
}: DashboardFinanceSectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const selectedCompanyName =
    companyProfit.find((company) => company.groupKey === selectedCompanyKey)
      ?.name ?? null;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("dashboard.finance.eyebrow")}
          </div>
          <h2 className="mt-1 text-[22px] font-normal tracking-[-0.3px] text-foreground">
            {t("dashboard.finance.title")}
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
          {/* Full-width hero: profit breakdown, then per-company profit below. */}
          <div className="space-y-5">
            <DashboardProfitHero
              profit={profitTotals}
              revenue={profitRevenue}
              monthly={monthlyProfit}
            />
            <DashboardCompanyProfit
              companies={companyProfit}
              selectedKey={selectedCompanyKey}
              onSelectKey={setSelectedCompanyKey}
            />
          </div>

          {/* Per-item drill-down of the usluge/artikli profit components,
              scoped to the company selected above. */}
          <DashboardItemBreakdown
            breakdown={itemProfit}
            companyName={selectedCompanyName}
          />

          {/* Secondary trends, collapsed by default to keep the heroes prominent. */}
          <details className="group border-t border-border pt-4">
            <summary className="iris-focusable flex cursor-pointer list-none items-center justify-between gap-4 py-2 text-[12px] text-[color:var(--iris-ink-soft)]">
              <span>{t("dashboard.finance.detailToggle")}</span>
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
