import { useEffect, useMemo, useState } from "react";
import {
  billingDocumentIncludesVat,
  computeVatBreakdown,
  vatRateForTaxGroup,
  type VatBreakdown,
} from "@/shared/utils/vat";
import type { WorkOrder } from "@/types/work-order";

/**
 * Osnovica / PDV / total for a saved work order. Catalog lines are taxed at
 * their catalog item's PDV type (looked up here); ad-hoc lines, and an order
 * with a price but no lines, use the general rate. Otkup prices include PDV;
 * faktura/predračun prices are net and get PDV added on top.
 */
export function useWorkOrderVatBreakdown(order: WorkOrder): VatBreakdown {
  const lineItems = order.invoiceDraft.lineItems;
  const catalogIds = useMemo(
    () =>
      [...new Set(lineItems.map((line) => line.catalogItemId).filter(Boolean))].sort() as string[],
    [lineItems],
  );
  const catalogKey = catalogIds.join(",");
  const [rates, setRates] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (catalogIds.length === 0) return;
    let active = true;
    void Promise.all(
      catalogIds.map(async (id) => {
        try {
          const item = await window.api.getCatalogItemById(id);
          return [id, vatRateForTaxGroup(item?.taxGroup)] as const;
        } catch {
          return [id, vatRateForTaxGroup(null)] as const;
        }
      }),
    ).then((entries) => {
      if (active) setRates(new Map(entries));
    });
    return () => {
      active = false;
    };
    // catalogKey captures the id list; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey]);

  return useMemo(() => {
    const defaultRate = vatRateForTaxGroup(null);
    const lines =
      lineItems.length > 0
        ? lineItems.map((line) => ({
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            rate: line.catalogItemId
              ? (rates.get(line.catalogItemId) ?? defaultRate)
              : defaultRate,
          }))
        : [{ quantity: 1, unitPrice: order.price ?? 0, rate: defaultRate }];
    return computeVatBreakdown(lines, billingDocumentIncludesVat(order.billingDocumentType));
  }, [lineItems, rates, order.price, order.billingDocumentType]);
}
