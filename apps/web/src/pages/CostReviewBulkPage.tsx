import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft, Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildCostUpdates,
  collectUncostedRows,
  fillEmptyByPercent,
  lineNameKey,
  loadCostReviewOrders,
  saveCostUpdates,
  setRowCost,
} from "@/lib/work-orders/bulk-cost";
import { formatActionError } from "@/lib/errors";
import type { WorkOrder } from "@/types/work-order";

function formatMoney(value: number): string {
  return value.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Admin bulk backfill for the cost-review queue: every line still missing a
 * cost, across all flagged orders, in one table. Costs can be typed per line,
 * copied to every line of the same name, or filled as a percentage of the
 * price, then saved order by order in one go.
 */
function CostReviewBulkPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [costs, setCosts] = useState<Map<string, number>>(() => new Map());
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  // What the admin typed per row (so "1," stays as typed); rows without a
  // draft show the cost filled in for them.
  const [drafts, setDrafts] = useState<Map<string, string>>(() => new Map());
  const [sameName, setSameName] = useState(true);
  const [percent, setPercent] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setOrders(await loadCostReviewOrders());
      setCosts(new Map());
      setTouched(new Set());
      setDrafts(new Map());
    } catch (error) {
      setLoadError(formatActionError(t("workOrders.costReview.bulk.loadError"), error));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => collectUncostedRows(orders ?? []), [orders]);
  const visibleRows = useMemo(() => {
    const query = lineNameKey(search);
    if (!query) return rows;
    return rows.filter(
      (row) =>
        lineNameKey(row.description).includes(query) ||
        lineNameKey(row.orderNumber).includes(query) ||
        lineNameKey(row.clientName).includes(query),
    );
  }, [rows, search]);
  const updates = useMemo(() => buildCostUpdates(orders ?? [], costs), [orders, costs]);

  const changeCost = (key: string, raw: string): void => {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (raw.trim() === "") next.delete(key);
      else next.set(key, raw);
      return next;
    });
    const trimmed = raw.trim().replace(",", ".");
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    const next = setRowCost({ rows, costs, touched, key, cost: value, sameName });
    setCosts(next.costs);
    setTouched(next.touched);
  };

  const fillByPercent = (): void => {
    const value = Number(percent.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast.error(t("workOrders.costReview.bulk.percentInvalid"));
      return;
    }
    setCosts(fillEmptyByPercent(visibleRows, costs, value));
  };

  const save = async (): Promise<void> => {
    if (updates.length === 0) return;
    setSaving({ done: 0, total: updates.length });
    const { saved, failed } = await saveCostUpdates(updates, (done) =>
      setSaving({ done, total: updates.length }),
    );
    setSaving(null);
    if (saved > 0) toast.success(t("workOrders.costReview.bulk.saved", { count: saved }));
    if (failed.length > 0) {
      toast.error(t("workOrders.costReview.bulk.failed", { orders: failed.join(", ") }));
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
        <Link
          to="/cost-review"
          className="mb-2 inline-flex items-center gap-1 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          {t("workOrders.costReview.title")}
        </Link>
        <h1 className="flex items-center gap-2.5 text-[30px] font-normal tracking-[-0.8px] text-foreground">
          <Coins className="h-6 w-6 text-[color:var(--iris-accent)]" strokeWidth={1.5} />
          {t("workOrders.costReview.bulk.title")}
        </h1>
        <div className="text-[12px] text-[color:var(--iris-ink-soft)]">
          {t("workOrders.costReview.bulk.subtitle")}
        </div>
      </div>

      <div className="space-y-4 px-5 sm:px-8 lg:px-10">
        {orders === null && !loadError && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">{t("workOrders.list.loading")}</span>
          </div>
        )}
        {loadError && (
          <div role="alert" className="text-sm text-destructive">
            {loadError}
          </div>
        )}
        {orders !== null && rows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {t("workOrders.costReview.empty")}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-end gap-4 text-[12px]">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.6px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.costReview.bulk.search")}
                </span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-8 w-56"
                />
              </label>
              <label className="flex items-center gap-2 pb-2">
                <Checkbox
                  checked={sameName}
                  onCheckedChange={(checked) => setSameName(checked === true)}
                />
                {t("workOrders.costReview.bulk.sameName")}
              </label>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.6px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.costReview.bulk.percent")}
                  </span>
                  <Input
                    inputMode="decimal"
                    value={percent}
                    onChange={(event) => setPercent(event.target.value)}
                    className="h-8 w-20"
                    placeholder="60"
                  />
                </label>
                <Button type="button" variant="outline" size="sm" onClick={fillByPercent}>
                  {t("workOrders.costReview.bulk.fillEmpty")}
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.costReview.bulk.summary", {
                    filled: costs.size,
                    total: rows.length,
                  })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={costs.size === 0 || saving !== null}
                  onClick={() => {
                    setCosts(new Map());
                    setTouched(new Set());
                    setDrafts(new Map());
                  }}
                >
                  {t("workOrders.costReview.bulk.clear")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={updates.length === 0 || saving !== null}
                  onClick={() => void save()}
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving
                    ? t("workOrders.costReview.bulk.saving", saving)
                    : t("workOrders.costReview.bulk.save", { count: updates.length })}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("workOrders.costReview.bulk.colOrder")}</TableHead>
                    <TableHead>{t("workOrders.costReview.bulk.colClient")}</TableHead>
                    <TableHead>{t("workOrders.costReview.bulk.colItem")}</TableHead>
                    <TableHead className="text-right">{t("workOrders.form.colQuantity")}</TableHead>
                    <TableHead className="text-right">{t("workOrders.form.colPrice")}</TableHead>
                    <TableHead className="text-right">{t("workOrders.form.colCost")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const cost = costs.get(row.key);
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <Link
                            to={`/work-orders/${row.orderId}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {row.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[color:var(--iris-ink-soft)]">
                          {row.clientName}
                        </TableCell>
                        <TableCell>
                          {row.catalogItemId ? (
                            <Link
                              to={`/catalog/${row.catalogItemId}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {row.description}
                            </Link>
                          ) : (
                            row.description
                          )}
                          <div className="text-[10px] uppercase tracking-[0.6px] text-[color:var(--iris-ink-mute)]">
                            {t(`workOrders.lineKind.${row.kind}`)}
                          </div>
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {row.quantity.toLocaleString("sr-RS")} {row.unit}
                        </TableCell>
                        <TableCell className="tnum text-right">{formatMoney(row.unitPrice)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="decimal"
                            aria-label={t("workOrders.costReview.bulk.costFor", {
                              item: row.description,
                              order: row.orderNumber,
                            })}
                            value={
                              drafts.get(row.key) ?? (cost === undefined ? "" : String(cost))
                            }
                            onChange={(event) => changeCost(row.key, event.target.value)}
                            className="tnum ml-auto h-8 w-28 text-right"
                            disabled={saving !== null}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CostReviewBulkPage;
