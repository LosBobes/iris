import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pager } from "@/components/Pager";
import { formatRsd } from "@/lib/dashboard/format";
import type { ItemProfit, ItemProfitBreakdown } from "@/lib/dashboard/profit";

interface DashboardItemBreakdownProps {
  breakdown: ItemProfitBreakdown;
  /** Name of the company scoping the breakdown; null = all companies. */
  companyName: string | null;
}

const PAGE_SIZE = 6;

/**
 * Drills the aggregate usluge/artikli profit components down into the individual
 * services and articles that make them up — two ranked, side-by-side lists of
 * the most profitable line items per kind. Scoped to a single company's orders
 * when one is selected in the company-profit widget, otherwise across all.
 */
export function DashboardItemBreakdown({
  breakdown,
  companyName,
}: DashboardItemBreakdownProps): React.JSX.Element {
  const { t } = useTranslation();
  const { services, articles } = breakdown;
  const isEmpty = services.length === 0 && articles.length === 0;
  const scope = companyName
    ? t("dashboard.items.scopeCompany", { name: companyName })
    : t("dashboard.items.scopeAll");

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("dashboard.items.eyebrow")}
          </div>
          <h3 className="mt-1 text-[15px] font-normal text-foreground">
            {t("dashboard.items.title")}
          </h3>
        </div>
        <span className="mt-0.5 max-w-[60%] truncate border border-border bg-background px-2 py-1 text-[11px] text-[color:var(--iris-ink-soft)]">
          {scope}
        </span>
      </div>

      {isEmpty ? (
        <p className="px-5 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t("dashboard.items.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-[color:var(--iris-border-soft)]">
          <ItemColumn title={t("dashboard.profit.services")} items={services} />
          <ItemColumn title={t("dashboard.profit.articles")} items={articles} />
        </div>
      )}
    </section>
  );
}

function ItemColumn({
  title,
  items,
}: {
  title: string;
  items: ItemProfit[];
}): React.JSX.Element {
  const { t } = useTranslation();
  // Bars scaled to the global max so they stay comparable across pages
  // (items are pre-sorted by profit descending).
  const max = Math.max(...items.map((item) => item.profit), 1);
  const total = items.reduce((sum, item) => sum + item.profit, 0);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [items]);
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = items.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="flex flex-col px-5 py-5 sm:px-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
          {title}
        </span>
        <span className="tnum text-[12px] text-foreground">{formatRsd(total)}</span>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t("dashboard.items.noData")}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {pageRows.map((item, index) => (
            <li
              key={item.groupKey}
              className="grid grid-cols-[16px_1fr_auto] items-center gap-2"
            >
              <span className="tnum text-[11px] text-[color:var(--iris-ink-mute)]">
                {pageStart + index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-foreground" title={item.name}>
                  {item.name}
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden bg-[color:var(--iris-border-soft)]">
                  <span
                    className="block h-full"
                    style={{
                      width: `${(Math.max(item.profit, 0) / max) * 100}%`,
                      backgroundColor: "var(--iris-accent)",
                    }}
                  />
                </span>
              </span>
              <span className="tnum text-[12px] text-foreground">
                {formatRsd(item.profit)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-auto">
          <Pager
            page={safePage}
            totalPages={totalPages}
            total={items.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          />
        </div>
      )}
    </div>
  );
}
