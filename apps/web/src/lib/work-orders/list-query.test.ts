import { describe, expect, it } from "vitest";
import "@/i18n";
import {
  filterAndSortWorkOrders,
  foldSearchText,
  queryWorkOrderList,
} from "@/lib/work-orders/list-query";
import { makeWorkOrder as makeOrder } from "@/test/work-order-factory";
import type { WorkOrder, WorkOrderListFilters } from "@/types/work-order";

const numbers = (orders: WorkOrder[]) => orders.map((order) => order.orderNumber);
const run = (orders: WorkOrder[], filters: WorkOrderListFilters) =>
  numbers(filterAndSortWorkOrders(orders, { sort: "orderNumber", ...filters }));

describe("work-order list query (fixture twin of the API)", () => {
  it("folds Serbian diacritics the way the API does", () => {
    expect(foldSearchText("Štamparija Čobanović Đorđe Žuta")).toBe(
      "stamparija cobanovic djordje zuta",
    );
  });

  it("filters customer drill-downs by id", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", customerId: "customer-1" }),
      makeOrder({ id: "b", orderNumber: "RN-2", customerId: "customer-2" }),
    ];
    expect(run(orders, { customerId: "customer-1" })).toEqual(["RN-1"]);
  });

  it("filters by assigned operator, document type and delivery method", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", billingDocumentType: "invoice" }),
      makeOrder({
        id: "b",
        orderNumber: "RN-2",
        assignment: { assignedTo: "marko", priority: "normal" },
        shipping: { ...makeOrder().shipping, deliveryMethod: "pickup" },
      }),
    ];
    expect(run(orders, { assignedTo: "marko" })).toEqual(["RN-2"]);
    expect(run(orders, { billingDocumentType: "invoice" })).toEqual(["RN-1"]);
    expect(run(orders, { deliveryMethod: "pickup" })).toEqual(["RN-2"]);
  });

  it("keeps cancelled orders out of the queue buckets", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", dueDate: "2026-06-01", status: "inProgress" }),
      makeOrder({ id: "b", orderNumber: "RN-2", dueDate: "2026-06-01", status: "cancelled" }),
    ];
    expect(run(orders, { queue: "overdue", today: "2026-06-03" })).toEqual(["RN-1"]);
    // The cancelled nalog is still reachable through the status filter.
    expect(run(orders, { status: "cancelled" })).toEqual(["RN-2"]);
  });

  it("buckets today, this week, overdue and unassigned by the given date", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", dueDate: "2026-06-04" }),
      makeOrder({ id: "b", orderNumber: "RN-2", dueDate: "2026-06-03" }),
      makeOrder({ id: "c", orderNumber: "RN-3", dueDate: "2026-06-10" }),
      makeOrder({
        id: "d",
        orderNumber: "RN-4",
        dueDate: "2026-06-02",
        isCompleted: true,
        assignment: { assignedTo: null, priority: "normal" },
      }),
    ];
    const today = "2026-06-04";
    expect(run(orders, { queue: "today", today })).toEqual(["RN-1"]);
    expect(run(orders, { queue: "thisWeek", today })).toEqual(["RN-1", "RN-3"]);
    expect(run(orders, { queue: "overdue", today })).toEqual(["RN-2"]);
    expect(run(orders, { queue: "unassigned", today })).toEqual(["RN-4"]);
  });

  it("filters to orders needing cost review when the flag is set", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", needsCostReview: true }),
      makeOrder({ id: "b", orderNumber: "RN-2", needsCostReview: false }),
    ];
    expect(run(orders, { needsCostReview: true })).toEqual(["RN-1"]);
    expect(run(orders, {})).toEqual(["RN-1", "RN-2"]);
  });

  it("searches operator, priority, document type, price and dates", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", assignment: { assignedTo: "marko.petrovic", priority: "normal" } }),
      makeOrder({ id: "b", orderNumber: "RN-2", assignment: { assignedTo: "ana", priority: "urgent" } }),
      makeOrder({ id: "c", orderNumber: "RN-3", billingDocumentType: "proforma" }),
      makeOrder({ id: "d", orderNumber: "RN-4", price: 67000 }),
      makeOrder({ id: "e", orderNumber: "RN-5", issueDate: "2025-01-15", dueDate: "2026-09-30" }),
    ];
    expect(run(orders, { search: "marko.petrovic" })).toEqual(["RN-1"]);
    expect(run(orders, { search: "Hitno" })).toEqual(["RN-2"]); // Serbian label
    expect(run(orders, { search: "urgent" })).toEqual(["RN-2"]); // raw value
    expect(run(orders, { search: "Profaktura" })).toEqual(["RN-3"]);
    expect(run(orders, { search: "67000" })).toEqual(["RN-4"]);
    expect(run(orders, { search: "67.000" })).toEqual(["RN-4"]); // sr-Latn format
    expect(run(orders, { search: "30.09.2026" })).toEqual(["RN-5"]);
    expect(run(orders, { search: "2025-01-15" })).toEqual(["RN-5"]);
  });

  it("matches search regardless of diacritics", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-1", clientName: "Štamparija Čobanović" }),
      makeOrder({ id: "b", orderNumber: "RN-2", clientName: "Drugi" }),
    ];
    expect(run(orders, { search: "cobanovic" })).toEqual(["RN-1"]);
    expect(run(orders, { search: "ŠTAMPARIJA" })).toEqual(["RN-1"]);
  });

  it("sorts order numbers naturally, by priority rank and with missing values last", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-2026-9", dueDate: null }),
      makeOrder({ id: "b", orderNumber: "RN-2026-10", dueDate: "2026-06-02", assignment: { assignedTo: "ana", priority: "urgent" } }),
      makeOrder({ id: "c", orderNumber: "RN-2026-11", dueDate: "2026-06-01", assignment: { assignedTo: "ana", priority: "low" } }),
    ];
    expect(numbers(filterAndSortWorkOrders(orders, { sort: "-orderNumber" }))).toEqual([
      "RN-2026-11",
      "RN-2026-10",
      "RN-2026-9",
    ]);
    expect(numbers(filterAndSortWorkOrders(orders, { sort: "-priority" }))[0]).toBe("RN-2026-10");
    expect(numbers(filterAndSortWorkOrders(orders, { sort: "dueDate" }))).toEqual([
      "RN-2026-11",
      "RN-2026-10",
      "RN-2026-9",
    ]);
    expect(numbers(filterAndSortWorkOrders(orders, { sort: "-dueDate" })).at(-1)).toBe("RN-2026-9");
  });

  it("pages like the API: default 50, capped at 200, total over every match", () => {
    const orders = Array.from({ length: 260 }, (_, index) =>
      makeOrder({ id: String(index), orderNumber: `RN-${index}` }),
    );
    expect(queryWorkOrderList(orders).items).toHaveLength(50);
    const capped = queryWorkOrderList(orders, { limit: 1000 });
    expect(capped.items).toHaveLength(200);
    expect(capped.total).toBe(260);
    expect(queryWorkOrderList(orders, { limit: 25, offset: 250 }).items).toHaveLength(10);
  });
});
