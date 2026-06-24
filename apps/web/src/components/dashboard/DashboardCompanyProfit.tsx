import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pager } from "@/components/Pager";
import { formatMarginPct, formatRsd } from "@/lib/dashboard/format";
import type { CompanyProfit } from "@/lib/dashboard/profit";

interface DashboardCompanyProfitProps {
  companies: CompanyProfit[];
  /** Selected company group key; null shows the all-companies aggregate. */
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
}

const PAGE_SIZE = 6;

/** Sums every company row into a single "all companies" aggregate. */
function aggregateCompanies(companies: CompanyProfit[]): CompanyProfit | null {
  if (companies.length === 0) return null;
  return companies.reduce<CompanyProfit>(
    (acc, company) => ({
      ...acc,
      profit: acc.profit + company.profit,
      serviceProfit: acc.serviceProfit + company.serviceProfit,
      articleProfit: acc.articleProfit + company.articleProfit,
      revenue: acc.revenue + company.revenue,
      orderCount: acc.orderCount + company.orderCount,
    }),
    {
      groupKey: "__all__",
      customerId: null,
      name: "",
      profit: 0,
      serviceProfit: 0,
      articleProfit: 0,
      revenue: 0,
      orderCount: 0,
    },
  );
}

/**
 * The second finance element: a per-company profit selector plus a ranked
 * top-companies-by-profit list. Picking a company (dropdown or list row) shows
 * its profit, revenue and margin, and scopes the per-item breakdown below;
 * with nothing selected it shows the all-companies aggregate.
 */
export function DashboardCompanyProfit({
  companies,
  selectedKey,
  onSelectKey,
}: DashboardCompanyProfitProps): React.JSX.Element {
  const { t } = useTranslation();
  const selectedCompany = useMemo(
    () => companies.find((company) => company.groupKey === selectedKey) ?? null,
    [companies, selectedKey],
  );
  const allAggregate = useMemo(() => aggregateCompanies(companies), [companies]);
  // What the detail panel shows: the picked company, or the all-companies sum.
  const detail = selectedCompany ?? allAggregate;
  const detailName = selectedCompany
    ? selectedCompany.name
    : t("dashboard.company.allCompanies");

  // Bars are scaled to the global max so they stay comparable across pages
  // (companies are pre-sorted by profit descending).
  const max = Math.max(...companies.map((company) => company.profit), 1);
  const totalPages = Math.max(1, Math.ceil(companies.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  // Reset to the first page whenever the underlying list changes (e.g. filters).
  useEffect(() => setPage(0), [companies]);
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = companies.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t("dashboard.company.eyebrow")}
        </div>
        <h3 className="mt-1 text-[15px] font-normal text-foreground">
          {t("dashboard.company.title")}
        </h3>
      </div>

      {companies.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t("dashboard.company.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-[color:var(--iris-border-soft)]">
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
              {t("dashboard.company.selectCompany")}
              <select
                value={selectedKey ?? ""}
                onChange={(event) => onSelectKey(event.target.value || null)}
                className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
              >
                <option value="">{t("dashboard.company.allCompanies")}</option>
                {companies.map((company) => (
                  <option key={company.groupKey} value={company.groupKey}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            {detail && (
              <div className="space-y-2 border border-border bg-background p-4">
                <div className="truncate text-[14px] font-medium text-foreground">
                  {detailName}
                </div>
                <dl className="divide-y divide-[color:var(--iris-border-soft)] text-[12px]">
                  <SelectedStat
                    label={t("dashboard.company.totalProfit")}
                    value={formatRsd(detail.profit)}
                    emphasize
                  />
                  <SelectedStat
                    label={t("dashboard.company.services")}
                    value={formatRsd(detail.serviceProfit)}
                    muted
                  />
                  <SelectedStat
                    label={t("dashboard.company.articles")}
                    value={formatRsd(detail.articleProfit)}
                    muted
                  />
                  <SelectedStat
                    label={t("dashboard.company.margin")}
                    value={formatMarginPct(detail.profit, detail.revenue)}
                  />
                  <SelectedStat label={t("dashboard.company.revenue")} value={formatRsd(detail.revenue)} />
                  <SelectedStat label={t("dashboard.company.orderCount")} value={String(detail.orderCount)} />
                </dl>
              </div>
            )}
          </div>

          <div className="flex flex-col px-5 py-5 sm:px-6">
            <div className="mb-3 text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
              {t("dashboard.company.topCompanies")}
            </div>
            <ul className="space-y-2.5">
              {pageRows.map((company, index) => {
                const isSelected = company.groupKey === selectedKey;
                return (
                  <li key={company.groupKey}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        onSelectKey(isSelected ? null : company.groupKey)
                      }
                      className={[
                        "iris-focusable grid w-full grid-cols-[16px_1fr_auto] items-center gap-2 px-1 py-1 text-left",
                        isSelected ? "bg-[color:var(--iris-accent)]/10" : "hover:bg-[color:var(--iris-accent)]/5",
                      ].join(" ")}
                    >
                      <span className="tnum text-[11px] text-[color:var(--iris-ink-mute)]">
                        {pageStart + index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-foreground" title={company.name}>
                          {company.name}
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden bg-[color:var(--iris-border-soft)]">
                          <span
                            className="block h-full"
                            style={{
                              width: `${(Math.max(company.profit, 0) / max) * 100}%`,
                              backgroundColor: "var(--iris-accent)",
                            }}
                          />
                        </span>
                      </span>
                      <span className="tnum text-[12px] text-foreground">
                        {formatRsd(company.profit)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {totalPages > 1 && (
              <div className="mt-auto">
                <Pager
                  page={safePage}
                  totalPages={totalPages}
                  total={companies.length}
                  pageSize={PAGE_SIZE}
                  onPrev={() => setPage((p) => Math.max(0, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SelectedStat({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt
        className={[
          "min-w-0 truncate uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]",
          muted ? "text-[9px]" : "text-[10px]",
        ].join(" ")}
      >
        {label}
      </dt>
      <dd
        className={[
          "tnum shrink-0 whitespace-nowrap text-right",
          muted ? "text-[12px]" : "text-[14px]",
          emphasize
            ? "font-medium text-foreground"
            : muted
              ? "text-[color:var(--iris-ink-mute)]"
              : "text-[color:var(--iris-ink-soft)]",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
