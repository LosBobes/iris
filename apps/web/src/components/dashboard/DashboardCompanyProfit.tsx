import { useMemo, useState } from "react";
import { formatMarginPct, formatRsd } from "@/lib/dashboard/format";
import type { CompanyProfit } from "@/lib/dashboard/profit";

interface DashboardCompanyProfitProps {
  companies: CompanyProfit[];
}

const TOP_N = 8;

/**
 * The second finance element: a per-company profit selector plus a ranked
 * top-companies-by-profit list. Picking a company (dropdown or list row) shows
 * its profit, revenue and margin.
 */
export function DashboardCompanyProfit({
  companies,
}: DashboardCompanyProfitProps): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (companies.length === 0) return null;
    return (
      companies.find((company) => company.groupKey === selectedKey) ?? companies[0]
    );
  }, [companies, selectedKey]);

  const top = companies.slice(0, TOP_N);
  const max = Math.max(...top.map((company) => company.profit), 1);

  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Zarada po firmi
        </div>
        <h3 className="mt-1 text-[15px] font-normal text-foreground">
          Profitabilnost klijenata
        </h3>
      </div>

      {companies.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          Nema podataka o zaradi po firmama za izabrani period.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-[color:var(--iris-border-soft)]">
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
              Izaberite firmu
              <select
                value={selected?.groupKey ?? ""}
                onChange={(event) => setSelectedKey(event.target.value)}
                className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
              >
                {companies.map((company) => (
                  <option key={company.groupKey} value={company.groupKey}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            {selected && (
              <div className="space-y-2 border border-border bg-background p-4">
                <div className="truncate text-[14px] font-medium text-foreground">
                  {selected.name}
                </div>
                <dl className="divide-y divide-[color:var(--iris-border-soft)] text-[12px]">
                  <SelectedStat
                    label="Zarada (ukupno)"
                    value={formatRsd(selected.profit)}
                    emphasize
                  />
                  <SelectedStat
                    label="— Usluge"
                    value={formatRsd(selected.serviceProfit)}
                    muted
                  />
                  <SelectedStat
                    label="— Artikli"
                    value={formatRsd(selected.articleProfit)}
                    muted
                  />
                  <SelectedStat
                    label="Marža"
                    value={formatMarginPct(selected.profit, selected.revenue)}
                  />
                  <SelectedStat label="Prihod" value={formatRsd(selected.revenue)} />
                  <SelectedStat label="Naloga" value={String(selected.orderCount)} />
                </dl>
              </div>
            )}
          </div>

          <div className="px-5 py-5 sm:px-6">
            <div className="mb-3 text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
              Najprofitabilnije firme
            </div>
            <ul className="space-y-2.5">
              {top.map((company, index) => {
                const isSelected = company.groupKey === selected?.groupKey;
                return (
                  <li key={company.groupKey}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(company.groupKey)}
                      className={[
                        "iris-focusable grid w-full grid-cols-[16px_1fr_auto] items-center gap-2 px-1 py-1 text-left",
                        isSelected ? "bg-[color:var(--iris-accent)]/10" : "hover:bg-[color:var(--iris-accent)]/5",
                      ].join(" ")}
                    >
                      <span className="tnum text-[11px] text-[color:var(--iris-ink-mute)]">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-foreground">
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
