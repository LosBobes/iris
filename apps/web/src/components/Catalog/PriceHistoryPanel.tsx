import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  formatCatalogPrice,
  formatEffectiveDate,
  todayIso,
} from "@/lib/catalog";
import type { CatalogItemCost } from "@/types/catalog";

/**
 * Read-only price-history panel for the catalog detail page (admin-only). Lists
 * the item's effective-dated price periods newest-first and surfaces a hint when
 * a future price change is scheduled but not yet effective. Reloads whenever
 * refreshToken changes (e.g. after a save).
 */
export function PriceHistoryPanel({
  itemId,
  refreshToken,
}: {
  itemId: string;
  refreshToken: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [history, setHistory] = useState<CatalogItemCost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.api
      .getCatalogItemCostHistory(itemId)
      .then((records) => {
        if (active) setHistory(records);
      })
      .catch(() => {
        if (active) setHistory([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [itemId, refreshToken]);

  const today = todayIso();
  // history is newest-first; a scheduled change is the newest open record whose
  // effective date is still in the future.
  const scheduled =
    history.length > 0 &&
    history[0].effectiveTo === null &&
    history[0].effectiveFrom > today
      ? history[0]
      : undefined;

  return (
    <section>
      <div className="mb-3 border-b border-border pb-2 text-[13px] font-medium">
        {t("catalog.detail.priceHistory.title")}
      </div>

      {scheduled && (
        <div className="mb-3 border border-border bg-muted/40 px-3 py-2 text-[12px] text-foreground">
          {t("catalog.detail.priceHistory.scheduledHint", {
            date: formatEffectiveDate(scheduled.effectiveFrom),
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("catalog.detail.priceHistory.loading")}
        </div>
      ) : history.length === 0 ? (
        <div className="py-4 text-[12px] text-muted-foreground">
          {t("catalog.detail.priceHistory.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-[color:var(--iris-ink-soft)]">
                <th className="py-1.5 pr-3 font-normal">
                  {t("catalog.detail.priceHistory.period")}
                </th>
                <th className="py-1.5 pr-3 text-right font-normal">
                  {t("catalog.detail.priceHistory.purchase")}
                </th>
                <th className="py-1.5 text-right font-normal">
                  {t("catalog.detail.priceHistory.sale")}
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => {
                const isScheduled =
                  record.effectiveTo === null && record.effectiveFrom > today;
                const isCurrent =
                  record.effectiveTo === null && record.effectiveFrom <= today;
                return (
                  <tr key={record.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">
                      <span className="text-foreground">
                        {formatPeriod(t, record, today)}
                      </span>
                      {isCurrent && (
                        <span className="ml-2 text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                          {t("catalog.detail.priceHistory.current")}
                        </span>
                      )}
                      {isScheduled && (
                        <span className="ml-2 text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                          {t("catalog.detail.priceHistory.scheduled")}
                        </span>
                      )}
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right text-foreground">
                      {formatCatalogPrice(record.purchasePrice)}
                    </td>
                    <td className="tnum py-1.5 text-right text-foreground">
                      {formatCatalogPrice(record.salePrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatPeriod(
  t: (key: string, options?: Record<string, unknown>) => string,
  record: CatalogItemCost,
  today: string,
): string {
  const from = formatEffectiveDate(record.effectiveFrom);
  if (record.effectiveTo === null) {
    if (record.effectiveFrom > today) {
      return t("catalog.detail.priceHistory.fromDate", { date: from });
    }
    return t("catalog.detail.priceHistory.fromDateOpen", { date: from });
  }
  return t("catalog.detail.priceHistory.range", {
    from,
    to: formatEffectiveDate(record.effectiveTo),
  });
}
