import {
  billingDocumentIncludesVat,
  removeVat,
  vatRateForTaxGroup,
} from "@/shared/utils/vat";
import type { CatalogItem, CatalogItemInput } from "@/types/catalog";
import type {
  BillingDocumentType,
  InvoiceLineItemKind,
} from "@/types/work-order";

/** The part of a work-order line the catalog price sync looks at. */
export interface PriceSyncLine {
  id: string;
  kind: InvoiceLineItemKind;
  unitPrice: number;
  catalogItemId?: string | null;
}

/** A line as it was saved, with the order's document type at that time. */
export interface PriceSyncBaseline {
  unitPrice: number;
  billingDocumentType: BillingDocumentType | null;
}

/** A new net sale price to write to a catalog item. */
export interface CatalogPriceChange {
  catalogItemId: string;
  salePrice: number;
}

const PRICE_EPSILON = 0.005;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The catalog (net) price a line's unit price stands for. Catalog sale prices
 * are net; on an otkup order an article (roba) is priced gross at its own PDV
 * rate, so PDV comes out. Services always keep the catalog price as-is.
 */
export function netCatalogPrice(
  unitPrice: number,
  kind: InvoiceLineItemKind,
  billingDocumentType: BillingDocumentType | null,
  rate: number,
): number {
  const price = Number(unitPrice) || 0;
  if (kind === "goods" && billingDocumentIncludesVat(billingDocumentType)) {
    return removeVat(price, rate);
  }
  return roundMoney(price);
}

/**
 * Catalog price changes implied by an admin's save: catalog lines whose net
 * price differs from what was saved before (lines already on the order), or
 * from the catalog's current sale price (lines added in this edit). Lines
 * already on the order keep their historical price unless it was edited, so
 * re-saving an old order never rolls the catalog back. When several lines of
 * one item changed, the last one wins.
 */
export function collectCatalogPriceChanges(params: {
  lines: PriceSyncLine[];
  billingDocumentType: BillingDocumentType | null;
  baseline: ReadonlyMap<string, PriceSyncBaseline>;
  catalogItems: ReadonlyMap<string, CatalogItem>;
}): CatalogPriceChange[] {
  const { lines, billingDocumentType, baseline, catalogItems } = params;
  const changes = new Map<string, number>();
  for (const line of lines) {
    if (!line.catalogItemId) continue;
    const item = catalogItems.get(line.catalogItemId);
    if (!item) continue;
    const rate = vatRateForTaxGroup(item.taxGroup);
    const next = netCatalogPrice(line.unitPrice, line.kind, billingDocumentType, rate);
    const saved = baseline.get(line.id);
    if (saved) {
      const before = netCatalogPrice(
        saved.unitPrice,
        line.kind,
        saved.billingDocumentType,
        rate,
      );
      if (Math.abs(before - next) < PRICE_EPSILON) continue;
    }
    if (item.salePrice !== null && Math.abs(item.salePrice - next) < PRICE_EPSILON) {
      continue;
    }
    changes.set(line.catalogItemId, next);
  }
  return [...changes.entries()].map(([catalogItemId, salePrice]) => ({
    catalogItemId,
    salePrice,
  }));
}

function catalogItemInput(item: CatalogItem, salePrice: number): CatalogItemInput {
  return {
    code: item.code,
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    purchasePrice: item.purchasePrice,
    salePrice,
    barcode: item.barcode,
    taxGroup: item.taxGroup,
    description: item.description,
    isActive: item.isActive,
    minStock: item.minStock ?? null,
  };
}

/**
 * Writes the sale prices an admin changed on a work order back to the catalog,
 * effective today. Returns how many items were updated; throws if any update
 * failed (after trying all of them).
 */
export async function syncCatalogPrices(params: {
  lines: PriceSyncLine[];
  billingDocumentType: BillingDocumentType | null;
  baseline: ReadonlyMap<string, PriceSyncBaseline>;
}): Promise<number> {
  const ids = [
    ...new Set(
      params.lines
        .map((line) => line.catalogItemId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return 0;
  const items = new Map<string, CatalogItem>();
  for (const id of ids) {
    const item = await window.api.getCatalogItemById(id);
    if (item) items.set(id, item);
  }
  const changes = collectCatalogPriceChanges({ ...params, catalogItems: items });
  const results = await Promise.allSettled(
    changes.map((change) =>
      window.api.updateCatalogItem(
        change.catalogItemId,
        catalogItemInput(items.get(change.catalogItemId)!, change.salePrice),
      ),
    ),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
  return changes.length;
}
