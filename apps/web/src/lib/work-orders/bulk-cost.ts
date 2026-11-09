import type { InvoiceLineItem, InvoiceLineItemKind, WorkOrder } from "@/types/work-order";

/** One line, on some order, that still has no cost (blocks the cost review). */
export interface UncostedRow {
  /** `${orderId}:${lineId}` — unique across the queue. */
  key: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  lineId: string;
  description: string;
  kind: InvoiceLineItemKind;
  quantity: number;
  unit: string;
  unitPrice: number;
  catalogItemId: string | null;
}

const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 25;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Name used to group lines that are "the same item" (case/space-insensitive). */
export function lineNameKey(description: string): string {
  return description.trim().replace(/\s+/g, " ").toLocaleLowerCase("sr-Latn");
}

/** Every line with no cost on the given orders, in order then line order. */
export function collectUncostedRows(orders: WorkOrder[]): UncostedRow[] {
  const rows: UncostedRow[] = [];
  for (const order of orders) {
    for (const line of order.invoiceDraft.lineItems) {
      if (line.unitCost !== null && line.unitCost !== undefined) continue;
      rows.push({
        key: `${order.id}:${line.id}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientName: order.clientName,
        lineId: line.id,
        description: line.description,
        kind: line.kind,
        quantity: Number(line.quantity) || 0,
        unit: line.unit,
        unitPrice: Number(line.unitPrice) || 0,
        catalogItemId: line.catalogItemId ?? null,
      });
    }
  }
  return rows;
}

/**
 * Costs for the rows still empty, as `percent` of each line's unit price
 * (e.g. 60 → cost is 60% of the price). Rows that already have a cost keep it.
 */
export function fillEmptyByPercent(
  rows: UncostedRow[],
  costs: ReadonlyMap<string, number>,
  percent: number,
): Map<string, number> {
  const next = new Map(costs);
  for (const row of rows) {
    if (next.has(row.key)) continue;
    next.set(row.key, roundMoney((row.unitPrice * percent) / 100));
  }
  return next;
}

/**
 * Sets one row's cost and, when `sameName` is on, every other row with the same
 * line name that the admin has not set by hand.
 */
export function setRowCost(params: {
  rows: UncostedRow[];
  costs: ReadonlyMap<string, number>;
  touched: ReadonlySet<string>;
  key: string;
  cost: number | null;
  sameName: boolean;
}): { costs: Map<string, number>; touched: Set<string> } {
  const { rows, key, cost, sameName } = params;
  const costs = new Map(params.costs);
  const touched = new Set(params.touched);
  const apply = (rowKey: string) => {
    if (cost === null) costs.delete(rowKey);
    else costs.set(rowKey, cost);
  };
  apply(key);
  if (cost === null) touched.delete(key);
  else touched.add(key);
  if (sameName) {
    const row = rows.find((candidate) => candidate.key === key);
    if (row) {
      const name = lineNameKey(row.description);
      for (const other of rows) {
        if (other.key === key || touched.has(other.key)) continue;
        if (lineNameKey(other.description) === name) apply(other.key);
      }
    }
  }
  return { costs, touched };
}

/** Per order, its lines with the entered costs applied. Orders with nothing entered are left out. */
export function buildCostUpdates(
  orders: WorkOrder[],
  costs: ReadonlyMap<string, number>,
): { order: WorkOrder; lineItems: InvoiceLineItem[] }[] {
  const updates: { order: WorkOrder; lineItems: InvoiceLineItem[] }[] = [];
  for (const order of orders) {
    let changed = false;
    const lineItems = order.invoiceDraft.lineItems.map((line) => {
      const cost = costs.get(`${order.id}:${line.id}`);
      if (cost === undefined) return line;
      changed = true;
      return { ...line, unitCost: cost };
    });
    if (changed) updates.push({ order, lineItems });
  }
  return updates;
}

/** All orders in the cost-review queue (every page). */
export async function loadCostReviewOrders(): Promise<WorkOrder[]> {
  const orders: WorkOrder[] = [];
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const { items, total } = await window.api.getWorkOrders({
      needsCostReview: true,
      view: "summary",
      sort: "orderNumber",
      limit: LIST_PAGE_SIZE,
      offset: page * LIST_PAGE_SIZE,
    });
    orders.push(...items);
    if ((page + 1) * LIST_PAGE_SIZE >= total || items.length === 0) break;
  }
  return orders;
}

/** Saves the entered costs order by order. Returns how many saved and which failed. */
export async function saveCostUpdates(
  updates: { order: WorkOrder; lineItems: InvoiceLineItem[] }[],
  onProgress?: (done: number) => void,
): Promise<{ saved: number; failed: string[] }> {
  let saved = 0;
  const failed: string[] = [];
  for (const [index, { order, lineItems }] of updates.entries()) {
    try {
      await window.api.updateWorkOrder(order.id, {
        invoiceDraft: { ...order.invoiceDraft, lineItems },
      });
      saved += 1;
    } catch {
      failed.push(order.orderNumber);
    }
    onProgress?.(index + 1);
  }
  return { saved, failed };
}
