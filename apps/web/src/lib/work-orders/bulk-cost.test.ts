import { describe, expect, it } from "vitest";
import type { WorkOrder } from "@/types/work-order";
import {
  buildCostUpdates,
  collectUncostedRows,
  fillEmptyByPercent,
  setRowCost,
} from "./bulk-cost";

function order(id: string, lines: Array<Partial<WorkOrder["invoiceDraft"]["lineItems"][number]>>): WorkOrder {
  return {
    id,
    orderNumber: `N-${id}`,
    clientName: "Kupac",
    invoiceDraft: {
      paidAt: null,
      lineItems: lines.map((line, index) => ({
        id: `l${index}`,
        kind: "service",
        description: "Montaža",
        quantity: 1,
        unit: "kom",
        unitPrice: 1000,
        unitCost: null,
        catalogItemId: null,
        ...line,
      })),
    },
  } as unknown as WorkOrder;
}

const orders = [
  order("a", [{ description: "Montaža" }, { description: "Baner", unitCost: 400 }]),
  order("b", [{ description: " montaža ", unitPrice: 2000 }, { description: "Dizajn" }]),
];

describe("bulk cost backfill", () => {
  it("lists only lines without a cost", () => {
    expect(collectUncostedRows(orders).map((row) => row.key)).toEqual(["a:l0", "b:l0", "b:l1"]);
  });

  it("copies a cost to same-named lines the admin has not set", () => {
    const rows = collectUncostedRows(orders);
    let state = setRowCost({ rows, costs: new Map(), touched: new Set(), key: "b:l1", cost: 900, sameName: true });
    state = setRowCost({ rows, ...state, key: "a:l0", cost: 300, sameName: true });
    expect(state.costs.get("b:l0")).toBe(300);
    // A hand-set row is not overwritten by a later same-name entry.
    state = setRowCost({ rows, ...state, key: "b:l0", cost: 350, sameName: true });
    state = setRowCost({ rows, ...state, key: "a:l0", cost: 320, sameName: true });
    expect(state.costs.get("b:l0")).toBe(350);
    expect(state.costs.get("b:l1")).toBe(900);
  });

  it("fills empty rows as a percentage of the price", () => {
    const rows = collectUncostedRows(orders);
    const costs = fillEmptyByPercent(rows, new Map([["b:l1", 5]]), 60);
    expect(costs.get("a:l0")).toBe(600);
    expect(costs.get("b:l0")).toBe(1200);
    expect(costs.get("b:l1")).toBe(5);
  });

  it("builds one update per order that got a cost", () => {
    const updates = buildCostUpdates(orders, new Map([["b:l1", 900]]));
    expect(updates).toHaveLength(1);
    expect(updates[0].order.id).toBe("b");
    expect(updates[0].lineItems.map((line) => line.unitCost)).toEqual([null, 900]);
  });
});
