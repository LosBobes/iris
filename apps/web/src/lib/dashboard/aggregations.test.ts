import { describe, expect, it } from "vitest";
import {
  buildClientAttentionRows,
  buildSignalCounts,
  getWorkOrderAttentionSignals,
  normalizeClientGroupName,
} from "@/lib/dashboard/aggregations";
import type { WorkOrder } from "@/types/work-order";

function makeOrder(overrides: Partial<WorkOrder>): WorkOrder {
  return {
    id: "order-1",
    orderNumber: "RN-1",
    customerId: null,
    locationId: null,
    clientName: "Acme d.o.o.",
    contactPerson: null,
    jobDescription: "Test nalog",
    jobDetails: null,
    billingDocumentType: null,
    billingDocumentNumber: null,
    shipping: {
      deliveryMethod: null,
      drivesOut: false,
      postagePaymentType: null,
      waitForPayment: false,
      hasPackaging: false,
      hasLabeling: false,
      isFragile: false,
      requiresSignature: false,
      hasInsurance: false,
      shippingAddress: null,
    },
    issuedBy: "ana",
    executedBy: null,
    assignment: {
      assignedTo: "marko",
      priority: "normal",
    },
    issueDate: "2026-05-20",
    dueDate: null,
    isCompleted: false,
    status: "assigned",
    price: null,
    note: null,
    createdAt: "2026-05-20T08:00:00Z",
    updatedAt: "2026-05-20T08:00:00Z",
    completionDate: null,
    statusHistory: [],
    internalNotes: [],
    customerNotes: [],
    events: [],
    attachments: [],
    materialUsage: [],
    timeEntries: [],
    invoiceDraft: {
      status: "none",
      invoiceNumber: null,
      lineItems: [],
      paidAt: null,
    },
    communication: {
      publicToken: "token",
      notificationEmail: null,
      emailNotificationsEnabled: false,
      signedBy: null,
      signedAt: null,
    },
    ...overrides,
  };
}

describe("dashboard attention aggregations", () => {
  const today = "2026-06-03";

  it("classifies attention signals with shared queue date rules", () => {
    expect(
      getWorkOrderAttentionSignals(makeOrder({ dueDate: "2026-06-02" }), today),
    ).toContain("overdue");
    expect(
      getWorkOrderAttentionSignals(
        makeOrder({ dueDate: "2026-06-02", isCompleted: true }),
        today,
      ),
    ).not.toContain("overdue");
    expect(
      getWorkOrderAttentionSignals(makeOrder({ dueDate: "2026-06-03" }), today),
    ).toContain("dueToday");
    expect(
      getWorkOrderAttentionSignals(makeOrder({ dueDate: "2026-06-09" }), today),
    ).toContain("dueThisWeek");
    expect(
      getWorkOrderAttentionSignals(
        makeOrder({ assignment: { assignedTo: null, priority: "normal" } }),
        today,
      ),
    ).toContain("unassigned");
  });

  it("groups by customer id before normalized legacy client names", () => {
    const rows = buildClientAttentionRows(
      [
        makeOrder({
          id: "1",
          orderNumber: "RN-1",
          customerId: "customer-1",
          clientName: "Acme Stari naziv",
          dueDate: "2026-06-02",
          updatedAt: "2026-06-01T08:00:00Z",
        }),
        makeOrder({
          id: "2",
          orderNumber: "RN-2",
          customerId: "customer-1",
          clientName: "Acme Novi naziv",
          dueDate: "2026-06-03",
          updatedAt: "2026-06-02T08:00:00Z",
        }),
        makeOrder({
          id: "3",
          orderNumber: "RN-3",
          customerId: null,
          clientName: "  LEGACY client  ",
          dueDate: "2026-06-08",
        }),
        makeOrder({
          id: "4",
          orderNumber: "RN-4",
          customerId: null,
          clientName: "legacy CLIENT",
          dueDate: "2026-06-09",
          updatedAt: "2026-06-02T08:00:00Z",
        }),
      ],
      ["overdue", "dueToday", "dueThisWeek"],
      today,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      groupKey: "customer-1",
      customerId: "customer-1",
      displayName: "Acme Novi naziv",
      counts: {
        overdue: 1,
        dueToday: 1,
      },
    });
    expect(rows[0].orders.map((order) => order.orderNumber)).toEqual([
      "RN-1",
      "RN-2",
    ]);

    const legacyRow = rows.find((row) => row.groupKey === "legacy client");
    expect(legacyRow).toMatchObject({
      customerId: null,
      displayName: "legacy CLIENT",
      counts: {
        dueThisWeek: 2,
      },
    });
  });

  it("counts internal signals separately from core client attention", () => {
    const counts = buildSignalCounts(
      [
        makeOrder({
          id: "2",
          assignment: { assignedTo: null, priority: "normal" },
        }),
        makeOrder({ id: "3", dueDate: "2026-06-02" }),
      ],
      today,
    );

    expect(counts).toMatchObject({
      overdue: 1,
      unassigned: 1,
    });
  });

  it("normalizes legacy client names for deterministic grouping", () => {
    expect(normalizeClientGroupName("  Acme   D.O.O.  ")).toBe("acme d.o.o.");
  });
});
