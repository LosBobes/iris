import { describe, expect, it } from "vitest";
import {
  filterWorkOrdersForList,
  filtersFromSearchParams,
  filtersToSearchParams,
} from "@/hooks/useWorkOrders";
import type { WorkOrderColumnKey } from "@/lib/work-order-columns";
import type { WorkOrder } from "@/types/work-order";

function makeOrder(overrides: Partial<WorkOrder>): WorkOrder {
  return {
    id: "order-1",
    orderNumber: "RN-1",
    customerId: "customer-1",
    locationId: null,
    clientName: "Acme",
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
      assignedTo: "ana",
      priority: "normal",
    },
    issueDate: "2026-06-01",
    dueDate: null,
    isCompleted: false,
    status: "assigned",
    price: null,
    note: null,
    createdAt: "2026-06-01T08:00:00Z",
    updatedAt: "2026-06-01T08:00:00Z",
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

describe("work order filter query params", () => {
  it("reads supported dashboard deep-link params into filter state", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams(
        "queue=overdue&search=Acme&status=inProgress&billingDocumentType=invoice&deliveryMethod=pickup&dateFrom=2026-06-01&dateTo=2026-06-30",
      ),
    );

    expect(filters).toMatchObject({
      queue: "overdue",
      search: "Acme",
      status: "inProgress",
      billingDocumentType: "invoice",
      deliveryMethod: "pickup",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      customerId: "",
    });
  });

  it("ignores unsupported enum values and serializes only active filters", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams("queue=stale&status=active&search=Kompanija"),
    );

    expect(filters.queue).toBe("all");
    expect(filters.status).toBe("all");

    const params = filtersToSearchParams({
      ...filters,
      queue: "thisWeek",
      status: "inProgress",
      dateFrom: "2026-06-01",
    });

    expect(params.toString()).toBe(
      "search=Kompanija&status=inProgress&queue=thisWeek&dateFrom=2026-06-01",
    );
  });

  it("round-trips stable customer ids for dashboard drill-downs", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams("customerId=customer-1&queue=today"),
    );

    expect(filters.customerId).toBe("customer-1");
    expect(filtersToSearchParams(filters).toString()).toBe(
      "queue=today&customerId=customer-1",
    );
  });

  it("filters grouped customer links by id instead of display name", () => {
    const orders = [
      makeOrder({
        id: "old",
        orderNumber: "RN-old",
        customerId: "customer-1",
        clientName: "Acme stari naziv",
      }),
      makeOrder({
        id: "new",
        orderNumber: "RN-new",
        customerId: "customer-1",
        clientName: "Acme novi naziv",
      }),
      makeOrder({
        id: "other",
        orderNumber: "RN-other",
        customerId: "customer-2",
        clientName: "Acme novi naziv",
      }),
    ];

    expect(
      filterWorkOrdersForList(orders, {
        search: "Acme novi naziv",
        customerId: "customer-1",
        status: "all",
        billingDocumentType: "all",
        deliveryMethod: "all",
        queue: "all",
        dateFrom: "",
        dateTo: "",
      }).map((order) => order.orderNumber),
    ).toEqual(["RN-old", "RN-new"]);
  });

  it("round-trips the operator assignedTo deep-link param", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams("assignedTo=ana&queue=today"),
    );

    expect(filters.assignedTo).toBe("ana");
    expect(filtersToSearchParams(filters).toString()).toBe(
      "queue=today&assignedTo=ana",
    );
  });

  it("filters by assigned operator for operator dashboard cells", () => {
    const orders = [
      makeOrder({
        id: "a",
        orderNumber: "RN-a",
        assignment: { assignedTo: "ana", priority: "normal" },
      }),
      makeOrder({
        id: "b",
        orderNumber: "RN-b",
        assignment: { assignedTo: "marko", priority: "normal" },
      }),
      makeOrder({
        id: "u",
        orderNumber: "RN-u",
        assignment: { assignedTo: null, priority: "normal" },
      }),
    ];

    const base = {
      search: "",
      status: "all",
      billingDocumentType: "all",
      deliveryMethod: "all",
      queue: "all",
      customerId: "",
      assignedTo: "",
      dateFrom: "",
      dateTo: "",
      needsCostReview: false,
    } as const;

    expect(
      filterWorkOrdersForList(orders, { ...base, assignedTo: "ana" }).map(
        (order) => order.orderNumber,
      ),
    ).toEqual(["RN-a"]);
  });

  it("filters to orders needing cost review when the flag is set", () => {
    const orders = [
      makeOrder({ id: "needs", orderNumber: "RN-needs", needsCostReview: true }),
      makeOrder({ id: "ok", orderNumber: "RN-ok", needsCostReview: false }),
    ];

    const base = {
      search: "",
      customerId: "",
      status: "all" as const,
      billingDocumentType: "all" as const,
      deliveryMethod: "all" as const,
      queue: "all" as const,
      dateFrom: "",
      dateTo: "",
    };

    expect(
      filterWorkOrdersForList(orders, { ...base, needsCostReview: true }).map(
        (order) => order.orderNumber,
      ),
    ).toEqual(["RN-needs"]);

    expect(
      filterWorkOrdersForList(orders, { ...base, needsCostReview: false }).map(
        (order) => order.orderNumber,
      ),
    ).toEqual(["RN-needs", "RN-ok"]);
  });

  it("matches search across operator, priority, document type and price", () => {
    const orders = [
      makeOrder({
        id: "op",
        orderNumber: "RN-op",
        assignment: { assignedTo: "marko.petrovic", priority: "normal" },
      }),
      makeOrder({
        id: "prio",
        orderNumber: "RN-prio",
        assignment: { assignedTo: "ana", priority: "urgent" },
      }),
      makeOrder({ id: "doc", orderNumber: "RN-doc", billingDocumentType: "proforma" }),
      makeOrder({ id: "price", orderNumber: "RN-price", price: 67000 }),
    ];

    const baseFilters = {
      customerId: "",
      status: "all" as const,
      billingDocumentType: "all" as const,
      deliveryMethod: "all" as const,
      queue: "all" as const,
      dateFrom: "",
      dateTo: "",
    };

    const run = (search: string) =>
      filterWorkOrdersForList(orders, { ...baseFilters, search }).map(
        (order) => order.orderNumber,
      );

    expect(run("marko.petrovic")).toEqual(["RN-op"]);
    expect(run("Hitno")).toEqual(["RN-prio"]); // Serbian label for "urgent"
    expect(run("urgent")).toEqual(["RN-prio"]); // raw enum value
    expect(run("Profaktura")).toEqual(["RN-doc"]);
    expect(run("67000")).toEqual(["RN-price"]); // raw price
    expect(run("67.000")).toEqual(["RN-price"]); // formatted price (sr-Latn)
  });

  it("matches search across issue and due dates", () => {
    const orders = [
      makeOrder({ id: "issue", orderNumber: "RN-issue", issueDate: "2026-06-01" }),
      makeOrder({ id: "due", orderNumber: "RN-due", issueDate: "2025-01-15", dueDate: "2026-09-30" }),
    ];

    const baseFilters = {
      customerId: "",
      status: "all" as const,
      billingDocumentType: "all" as const,
      deliveryMethod: "all" as const,
      queue: "all" as const,
      dateFrom: "",
      dateTo: "",
    };

    const run = (search: string) =>
      filterWorkOrdersForList(orders, { ...baseFilters, search }).map(
        (order) => order.orderNumber,
      );

    expect(run("2026-06-01")).toEqual(["RN-issue"]); // ISO issue date
    expect(run("01.06.2026")).toEqual(["RN-issue"]); // formatted issue date
    expect(run("2026-09-30")).toEqual(["RN-due"]); // ISO due date
    expect(run("30.09.2026")).toEqual(["RN-due"]); // formatted due date
  });

  it("scopes free-text search to visible columns", () => {
    const orders = [makeOrder({ id: "p", orderNumber: "RN-p", price: 67000 })];
    const baseFilters = {
      search: "",
      customerId: "",
      status: "all" as const,
      billingDocumentType: "all" as const,
      deliveryMethod: "all" as const,
      queue: "all" as const,
      dateFrom: "",
      dateTo: "",
    };

    const allColumns = new Set<WorkOrderColumnKey>([
      "orderNumber",
      "clientName",
      "jobDescription",
      "assigned",
      "priority",
      "billing",
      "schedule",
      "price",
      "status",
    ]);
    const withoutPrice = new Set(allColumns);
    withoutPrice.delete("price");

    // Price is searchable while the column is visible...
    expect(
      filterWorkOrdersForList(
        orders,
        { ...baseFilters, search: "67000" },
        undefined,
        allColumns,
      ),
    ).toHaveLength(1);
    // ...and excluded once the column is hidden.
    expect(
      filterWorkOrdersForList(
        orders,
        { ...baseFilters, search: "67000" },
        undefined,
        withoutPrice,
      ),
    ).toHaveLength(0);
  });

  it("ignores the status filter when the status column is hidden", () => {
    const orders = [
      makeOrder({ id: "a", orderNumber: "RN-a", status: "assigned" }),
      makeOrder({ id: "b", orderNumber: "RN-b", status: "completed" }),
    ];
    const baseFilters = {
      search: "",
      customerId: "",
      status: "completed" as const,
      billingDocumentType: "all" as const,
      deliveryMethod: "all" as const,
      queue: "all" as const,
      dateFrom: "",
      dateTo: "",
    };

    const withStatus = new Set<WorkOrderColumnKey>(["orderNumber", "status"]);
    const withoutStatus = new Set<WorkOrderColumnKey>(["orderNumber"]);

    expect(
      filterWorkOrdersForList(orders, baseFilters, undefined, withStatus).map(
        (o) => o.orderNumber,
      ),
    ).toEqual(["RN-b"]);
    expect(
      filterWorkOrdersForList(orders, baseFilters, undefined, withoutStatus).map(
        (o) => o.orderNumber,
      ),
    ).toEqual(["RN-a", "RN-b"]);
  });

  it("uses local date for today and this-week queue filters", () => {
    const orders = [
      makeOrder({ id: "today", orderNumber: "RN-today", dueDate: "2026-06-04" }),
      makeOrder({ id: "yesterday", orderNumber: "RN-yesterday", dueDate: "2026-06-03" }),
      makeOrder({ id: "week", orderNumber: "RN-week", dueDate: "2026-06-10" }),
    ];

    const baseFilters = {
      search: "",
      customerId: "",
      status: "all" as const,
      billingDocumentType: "all" as const,
      deliveryMethod: "all" as const,
      dateFrom: "",
      dateTo: "",
    };

    expect(
      filterWorkOrdersForList(
        orders,
        { ...baseFilters, queue: "today" },
        "2026-06-04",
      ).map((order) => order.orderNumber),
    ).toEqual(["RN-today"]);
    expect(
      filterWorkOrdersForList(
        orders,
        { ...baseFilters, queue: "thisWeek" },
        "2026-06-04",
      ).map((order) => order.orderNumber),
    ).toEqual(["RN-today", "RN-week"]);
  });
});
