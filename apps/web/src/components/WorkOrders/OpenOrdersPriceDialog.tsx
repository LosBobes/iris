import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  applyPricesToOpenOrders,
  type AppliedPriceChange,
} from "@/lib/work-orders/catalog-price-sync";
import type { WorkOrder } from "@/types/work-order";

interface OpenOrdersPriceDialogProps {
  changes: AppliedPriceChange[];
  orders: WorkOrder[];
  /** Called once the admin has chosen (and any update has run). */
  onDone: () => void;
}

function formatMoney(value: number | null): string {
  if (value === null) return "–";
  return value.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Asked after an admin's save changed catalog prices: other orders still to be
 * processed carry the old price, so the admin decides whether they follow.
 */
export function OpenOrdersPriceDialog({
  changes,
  orders,
  onDone,
}: OpenOrdersPriceDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const update = async (): Promise<void> => {
    setBusy(true);
    try {
      const updated = await applyPricesToOpenOrders(orders, changes);
      toast.success(t("workOrders.form.openOrdersPrice.updated", { count: updated }));
    } catch {
      toast.error(t("workOrders.form.openOrdersPrice.error"));
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onDone()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workOrders.form.openOrdersPrice.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("workOrders.form.openOrdersPrice.description", { count: orders.length })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1 text-[12px]">
          {changes.map((change) => (
            <li key={change.catalogItemId} className="flex justify-between gap-4">
              <span className="text-foreground">{change.name}</span>
              <span className="tnum text-[color:var(--iris-ink-mute)]">
                {formatMoney(change.previousSalePrice)} → {formatMoney(change.salePrice)}
              </span>
            </li>
          ))}
        </ul>
        <ul className="max-h-32 overflow-y-auto text-[11px] text-[color:var(--iris-ink-mute)]">
          {orders.map((order) => (
            <li key={order.id}>
              {order.orderNumber} · {order.clientName}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("workOrders.form.openOrdersPrice.skip")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void update();
            }}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("workOrders.form.openOrdersPrice.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
