import { describe, expect, it } from "vitest";
import {
  buildWorkOrderListFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  toSortParam,
  type WorkOrdersFiltersState,
} from "@/hooks/useWorkOrders";
import type { WorkOrderColumnKey } from "@/lib/work-order-columns";

const BASE: WorkOrdersFiltersState = {
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
};

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

  it("round-trips the operator assignedTo deep-link param", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams("assignedTo=ana&queue=today"),
    );

    expect(filters.assignedTo).toBe("ana");
    expect(filtersToSearchParams(filters).toString()).toBe(
      "queue=today&assignedTo=ana",
    );
  });
});

describe("server-side list filters", () => {
  it("sends only the active filters", () => {
    expect(buildWorkOrderListFilters(BASE)).toEqual({});
    expect(
      buildWorkOrderListFilters({
        ...BASE,
        search: "  Acme ",
        assignedTo: "ana",
        billingDocumentType: "invoice",
        deliveryMethod: "pickup",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-30",
        needsCostReview: true,
      }),
    ).toEqual({
      search: "Acme",
      assignedTo: "ana",
      billingDocumentType: "invoice",
      deliveryMethod: "pickup",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      needsCostReview: true,
    });
  });

  it("filters grouped customer links by id instead of the display-name search", () => {
    expect(
      buildWorkOrderListFilters({
        ...BASE,
        search: "Acme novi naziv",
        customerId: "customer-1",
      }),
    ).toEqual({ customerId: "customer-1" });
  });

  it("sends the local date with a queue bucket", () => {
    expect(
      buildWorkOrderListFilters({ ...BASE, queue: "overdue" }, undefined, "2026-06-04"),
    ).toEqual({ queue: "overdue", today: "2026-06-04" });
  });

  it("ignores the status and document-type filters while their column is hidden", () => {
    const filters: WorkOrdersFiltersState = {
      ...BASE,
      status: "completed",
      billingDocumentType: "invoice",
    };
    const all = new Set<WorkOrderColumnKey>(["orderNumber", "status", "billing"]);
    const none = new Set<WorkOrderColumnKey>(["orderNumber"]);

    expect(buildWorkOrderListFilters(filters, all)).toEqual({
      status: "completed",
      billingDocumentType: "invoice",
    });
    expect(buildWorkOrderListFilters(filters, none)).toEqual({});
  });

  it("maps table sort columns to API sort params", () => {
    expect(toSortParam("orderNumber", "desc")).toBe("-orderNumber");
    expect(toSortParam("assignment.priority", "asc")).toBe("priority");
    expect(toSortParam("shipping.deliveryMethod", "desc")).toBe("-deliveryMethod");
    expect(toSortParam("assignment.assignedTo", "asc")).toBe("assignedTo");
  });
});
