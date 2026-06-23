import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { formatMarginPct, formatRsd } from "@/lib/dashboard/format";
import type { MonthlyProfit, ProfitTotals } from "@/lib/dashboard/profit";

interface DashboardProfitHeroProps {
  profit: ProfitTotals;
  revenue: number;
  monthly: MonthlyProfit[];
}

type Breakdown = "kind" | "month";

const SERVICE_COLOR = "var(--iris-accent)";
const ARTICLE_COLOR = "var(--iris-ink-mute)";

/**
 * The lead finance element: how much money was made (margin = prodajna − nabavna)
 * with a toggle between a by-kind (usluge vs artikli) and a by-month breakdown.
 */
export function DashboardProfitHero({
  profit,
  revenue,
  monthly,
}: DashboardProfitHeroProps): React.JSX.Element {
  const { t } = useTranslation();
  const [breakdown, setBreakdown] = useState<Breakdown>("kind");
  const cost = revenue - profit.total;

  const breakdownTabs: TabItem<Breakdown>[] = [
    { value: "kind", label: t("dashboard.profit.tabKind") },
    { value: "month", label: t("dashboard.profit.tabMonth") },
  ];

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("dashboard.profit.eyebrow")}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="tnum text-[32px] font-normal tracking-[-0.8px] text-foreground">
              {formatRsd(profit.total)}
            </span>
            <span className="tnum text-[12px] text-[color:var(--iris-ink-soft)]">
              {t("dashboard.profit.margin")} {formatMarginPct(profit.total, revenue)}
            </span>
          </div>
        </div>
        <Tabs
          tabs={breakdownTabs}
          value={breakdown}
          onValueChange={setBreakdown}
          aria-label={t("dashboard.profit.tabsAria")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr] lg:divide-x lg:divide-[color:var(--iris-border-soft)]">
        <div className="divide-y divide-[color:var(--iris-border-soft)] border-b border-border lg:border-b-0">
          <Stat label={t("dashboard.profit.revenue")} value={formatRsd(revenue)} />
          <Stat label={t("dashboard.profit.cost")} value={formatRsd(cost)} />
          <Stat label={t("dashboard.profit.profit")} value={formatRsd(profit.total)} emphasize />
        </div>

        <div className="px-5 py-5 sm:px-6">
          {breakdown === "kind" ? (
            <KindBreakdown profit={profit} />
          ) : (
            <MonthBreakdown monthly={monthly} />
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-3.5 sm:px-6">
      <span className="min-w-0 truncate text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
        {label}
      </span>
      <span
        className={[
          "tnum shrink-0 whitespace-nowrap text-right text-[14px]",
          emphasize ? "font-medium text-foreground" : "text-[color:var(--iris-ink-soft)]",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function KindBreakdown({ profit }: { profit: ProfitTotals }): React.JSX.Element {
  const { t } = useTranslation();
  const max = Math.max(profit.service, profit.article, 1);
  return (
    <div className="space-y-4">
      <ProfitBar label={t("dashboard.profit.services")} value={profit.service} max={max} color={SERVICE_COLOR} />
      <ProfitBar label={t("dashboard.profit.articles")} value={profit.article} max={max} color={ARTICLE_COLOR} />
    </div>
  );
}

function MonthBreakdown({ monthly }: { monthly: MonthlyProfit[] }): React.JSX.Element {
  const { t } = useTranslation();
  if (monthly.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
        {t("dashboard.profit.empty")}
      </p>
    );
  }
  const max = Math.max(...monthly.map((m) => m.total), 1);
  return (
    <div className="space-y-3">
      {monthly.map((month) => (
        <div key={month.month} className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
          <span className="tnum text-[11px] text-[color:var(--iris-ink-soft)]">{month.month}</span>
          <span className="flex h-2.5 overflow-hidden bg-[color:var(--iris-border-soft)]">
            <span
              style={{ width: `${(month.service / max) * 100}%`, backgroundColor: SERVICE_COLOR }}
              title={`${t("dashboard.profit.services")}: ${formatRsd(month.service)}`}
            />
            <span
              style={{ width: `${(month.article / max) * 100}%`, backgroundColor: ARTICLE_COLOR }}
              title={`${t("dashboard.profit.articles")}: ${formatRsd(month.article)}`}
            />
          </span>
          <span className="tnum text-[11px] text-foreground">{formatRsd(month.total)}</span>
        </div>
      ))}
      <Legend />
    </div>
  );
}

function ProfitBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
      <span className="text-[12px] text-[color:var(--iris-ink-soft)]">{label}</span>
      <span className="h-3 overflow-hidden bg-[color:var(--iris-border-soft)]">
        <span
          className="block h-full"
          style={{ width: `${(Math.max(value, 0) / max) * 100}%`, backgroundColor: color }}
        />
      </span>
      <span className="tnum text-[12px] text-foreground">{formatRsd(value)}</span>
    </div>
  );
}

function Legend(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4 pt-1 text-[10px] text-[color:var(--iris-ink-mute)]">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2" style={{ backgroundColor: SERVICE_COLOR }} />
        {t("dashboard.profit.services")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2" style={{ backgroundColor: ARTICLE_COLOR }} />
        {t("dashboard.profit.articles")}
      </span>
    </div>
  );
}
