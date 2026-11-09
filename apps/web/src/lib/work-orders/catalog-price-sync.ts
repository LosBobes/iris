import {
  addVat,
  billingDocumentIncludesVat,
  DEFAULT_VAT_TYPE,
  removeVat,
  vatRateForTaxGroup,
} from "@/shared/utils/vat";
import type { CatalogItem, CatalogItemInput, CatalogItemKind } from "@/types/catalog";
import type {
  BillingDocumentType,
  InvoiceLineItem,
  InvoiceLineItemKind,
  WorkOrder,
  WorkOrderStatus,
} from "@/types/work-order";

/** The part of a work-order line the catalog price sync looks at. */
export interface PriceSyncLine {
  id: string;
  kind: InvoiceLineItemKind;
  description?: string;
  unit?: string;
  unitPrice: number;
  unitCost?: number | null;
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

/** A catalog price an admin's save changed, as shown in the open-orders prompt. */
export interface AppliedPriceChange {
  catalogItemId: string;
  name: string;
  kind: CatalogItemKind;
  previousSalePrice: number | null;
  salePrice: number;
  /** PDV rate of the item's tax group, to gross the price up on otkup orders. */
  rate: number;
}

/** Statuses of orders still to be processed (not completed, invoiced or cancelled). */
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = ["new", "assigned", "inProgress"];

const PRICE_EPSILON = 0.005;
const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 25;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) < PRICE_EPSILON;
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

/** The inverse of netCatalogPrice: what a line on this order charges. */
export function linePriceFromCatalog(
  salePrice: number,
  kind: InvoiceLineItemKind,
  billingDocumentType: BillingDocumentType | null,
  rate: number,
): number {
  if (kind === "goods" && billingDocumentIncludesVat(billingDocumentType)) {
    return addVat(salePrice, rate);
  }
  return roundMoney(salePrice);
}

/** True when the line is new in this edit or its net price was edited. */
function priceWasSet(
  line: PriceSyncLine,
  billingDocumentType: BillingDocumentType | null,
  baseline: ReadonlyMap<string, PriceSyncBaseline>,
  rate: number,
): boolean {
  const saved = baseline.get(line.id);
  if (!saved) return true;
  const before = netCatalogPrice(saved.unitPrice, line.kind, saved.billingDocumentType, rate);
  const next = netCatalogPrice(line.unitPrice, line.kind, billingDocumentType, rate);
  return !samePrice(before, next);
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
    if (!priceWasSet(line, billingDocumentType, baseline, rate)) continue;
    const next = netCatalogPrice(line.unitPrice, line.kind, billingDocumentType, rate);
    if (item.salePrice !== null && samePrice(item.salePrice, next)) continue;
    changes.set(line.catalogItemId, next);
  }
  return [...changes.entries()].map(([catalogItemId, salePrice]) => ({
    catalogItemId,
    salePrice,
  }));
}

/**
 * Special (ad-hoc) lines an admin priced in this save: new ones, or saved ones
 * whose price changed. Lines without a name or a price are skipped.
 */
export function collectSpecialLinesToCatalog(params: {
  lines: PriceSyncLine[];
  billingDocumentType: BillingDocumentType | null;
  baseline: ReadonlyMap<string, PriceSyncBaseline>;
}): PriceSyncLine[] {
  const rate = vatRateForTaxGroup(DEFAULT_VAT_TYPE);
  return params.lines.filter(
    (line) =>
      !line.catalogItemId &&
      (line.description ?? "").trim() !== "" &&
      (Number(line.unitPrice) || 0) > 0 &&
      priceWasSet(line, params.billingDocumentType, params.baseline, rate),
  );
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

function catalogKindFor(kind: InvoiceLineItemKind): CatalogItemKind {
  return kind === "goods" ? "article" : "service";
}

function appliedChange(item: CatalogItem, salePrice: number): AppliedPriceChange {
  return {
    catalogItemId: item.id,
    name: item.name,
    kind: item.kind,
    previousSalePrice: item.salePrice,
    salePrice,
    rate: vatRateForTaxGroup(item.taxGroup),
  };
}

/** An existing catalog item with the same name (any case) and kind, if any. */
async function findCatalogItemByName(
  name: string,
  kind: CatalogItemKind,
): Promise<CatalogItem | null> {
  const { items } = await window.api.getCatalogItems({ q: name, kind, limit: 50 });
  const wanted = name.trim().toLocaleLowerCase("sr-Latn");
  return (
    items.find((item) => item.name.trim().toLocaleLowerCase("sr-Latn") === wanted) ?? null
  );
}

export interface CatalogSyncResult {
  /** Catalog prices changed by this save (edited catalog lines, and special
   * lines matched to an existing item by name). */
  changes: AppliedPriceChange[];
  /** Catalog items created from special lines. */
  created: number;
  /** The saved order, with special lines linked to their catalog item. */
  order: WorkOrder;
}

/**
 * Writes an admin's pricing back to the catalog after the order is saved:
 * - an edited catalog line's price becomes the item's sale price (net, effective today);
 * - a special line priced in this save becomes a catalog item (or updates the
 *   item of the same name and kind) and the line is linked to it.
 * Throws if any write failed (after trying the rest).
 */
export async function syncCatalogFromOrder(params: {
  order: WorkOrder;
  lines: PriceSyncLine[];
  billingDocumentType: BillingDocumentType | null;
  baseline: ReadonlyMap<string, PriceSyncBaseline>;
}): Promise<CatalogSyncResult> {
  const { lines, billingDocumentType, baseline } = params;
  let order = params.order;
  const changes = new Map<string, AppliedPriceChange>();
  let created = 0;
  let failure: unknown = null;

  // 1. Special lines → catalog items, linked back onto the order.
  const links = new Map<string, string>();
  for (const line of collectSpecialLinesToCatalog({ lines, billingDocumentType, baseline })) {
    try {
      const kind = catalogKindFor(line.kind);
      const name = (line.description ?? "").trim();
      const existing = await findCatalogItemByName(name, kind);
      const rate = vatRateForTaxGroup(existing?.taxGroup ?? DEFAULT_VAT_TYPE);
      const salePrice = netCatalogPrice(line.unitPrice, line.kind, billingDocumentType, rate);
      if (existing) {
        if (existing.salePrice === null || !samePrice(existing.salePrice, salePrice)) {
          await window.api.updateCatalogItem(existing.id, catalogItemInput(existing, salePrice));
          changes.set(existing.id, appliedChange(existing, salePrice));
        }
        links.set(line.id, existing.id);
      } else {
        const item = await window.api.createCatalogItem({
          code: "",
          name,
          kind,
          unit: line.unit || "kom",
          purchasePrice: line.unitCost ?? null,
          salePrice,
          barcode: null,
          taxGroup: DEFAULT_VAT_TYPE,
          description: null,
          isActive: true,
        });
        created += 1;
        links.set(line.id, item.id);
      }
    } catch (error) {
      failure ??= error;
    }
  }
  if (links.size > 0) {
    try {
      const linked = await window.api.updateWorkOrder(order.id, {
        invoiceDraft: {
          ...order.invoiceDraft,
          lineItems: order.invoiceDraft.lineItems.map((line) =>
            links.has(line.id) ? { ...line, catalogItemId: links.get(line.id)! } : line,
          ),
        },
      });
      if (linked) order = linked;
    } catch (error) {
      failure ??= error;
    }
  }

  // 2. Edited catalog lines → the item's sale price.
  const ids = [
    ...new Set(lines.map((line) => line.catalogItemId).filter((id): id is string => Boolean(id))),
  ];
  const items = new Map<string, CatalogItem>();
  for (const id of ids) {
    try {
      const item = await window.api.getCatalogItemById(id);
      if (item) items.set(id, item);
    } catch (error) {
      failure ??= error;
    }
  }
  for (const change of collectCatalogPriceChanges({ lines, billingDocumentType, baseline, catalogItems: items })) {
    const item = items.get(change.catalogItemId)!;
    try {
      await window.api.updateCatalogItem(item.id, catalogItemInput(item, change.salePrice));
      changes.set(item.id, appliedChange(item, change.salePrice));
    } catch (error) {
      failure ??= error;
    }
  }

  if (failure) throw failure;
  return { changes: [...changes.values()], created, order };
}

/** Open orders (other than `excludeOrderId`) with a line on any of these items. */
export async function findOpenOrdersWithItems(
  catalogItemIds: string[],
  excludeOrderId: string | null,
): Promise<WorkOrder[]> {
  if (catalogItemIds.length === 0) return [];
  const wanted = new Set(catalogItemIds);
  const found: WorkOrder[] = [];
  for (const status of OPEN_WORK_ORDER_STATUSES) {
    for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
      const { items, total } = await window.api.getWorkOrders({
        status,
        view: "summary",
        limit: LIST_PAGE_SIZE,
        offset: page * LIST_PAGE_SIZE,
      });
      for (const order of items) {
        if (order.id === excludeOrderId) continue;
        if (order.invoiceDraft.lineItems.some((line) => line.catalogItemId && wanted.has(line.catalogItemId))) {
          found.push(order);
        }
      }
      if ((page + 1) * LIST_PAGE_SIZE >= total || items.length === 0) break;
    }
  }
  return found;
}

/**
 * The order's lines re-priced to the new catalog prices, or null when nothing
 * on it changes. Otkup articles are re-grossed at the item's PDV rate.
 */
export function repriceOrderLines(
  order: WorkOrder,
  changes: ReadonlyMap<string, AppliedPriceChange>,
): { lineItems: InvoiceLineItem[]; price: number } | null {
  let changed = false;
  const lineItems = order.invoiceDraft.lineItems.map((line) => {
    const change = line.catalogItemId ? changes.get(line.catalogItemId) : undefined;
    if (!change) return line;
    const unitPrice = linePriceFromCatalog(
      change.salePrice,
      line.kind,
      order.billingDocumentType,
      change.rate,
    );
    if (samePrice(unitPrice, line.unitPrice)) return line;
    changed = true;
    return { ...line, unitPrice };
  });
  if (!changed) return null;
  const price = roundMoney(
    lineItems.reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
      0,
    ),
  );
  return { lineItems, price };
}

/** Applies new catalog prices to open orders. Returns how many were updated. */
export async function applyPricesToOpenOrders(
  orders: WorkOrder[],
  changes: AppliedPriceChange[],
): Promise<number> {
  const byId = new Map(changes.map((change) => [change.catalogItemId, change]));
  let updated = 0;
  let failure: unknown = null;
  for (const order of orders) {
    const repriced = repriceOrderLines(order, byId);
    if (!repriced) continue;
    try {
      await window.api.updateWorkOrder(order.id, {
        invoiceDraft: { ...order.invoiceDraft, lineItems: repriced.lineItems },
        price: repriced.price,
      });
      updated += 1;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return updated;
}
