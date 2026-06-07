import { describe, expect, it } from "vitest";
import {
  filterWorkOrdersForList,
  filtersFromSearchParams,
  filtersToSearchParams,
} from "@/hooks/useWorkOrders";
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
      scheduledDate: null,
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
        "queue=overdue&search=Acme&status=waitingForCustomer&billingDocumentType=invoice&deliveryMethod=pickup&dateFrom=2026-06-01&dateTo=2026-06-30",
      ),
    );

    expect(filters).toMatchObject({
      queue: "overdue",
      search: "Acme",
      status: "waitingForCustomer",
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
      status: "waitingForMaterials",
      dateFrom: "2026-06-01",
    });

    expect(params.toString()).toBe(
      "search=Kompanija&status=waitingForMaterials&queue=thisWeek&dateFrom=2026-06-01",
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
