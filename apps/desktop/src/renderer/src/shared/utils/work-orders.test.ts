import {
  WORK_ORDER_BILLING_LABELS,
  WORK_ORDER_DELIVERY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_VARIANTS,
  WORK_ORDER_SELECT_NONE_VALUE,
  canToggleWorkOrderCompletion,
  formatWorkOrderDate,
  formatWorkOrderDateTime,
  formatWorkOrderPrice,
  getLocalIsoDate,
} from "./work-orders";

describe("work-order shared utils", () => {
  it("exposes the select sentinel and label maps", () => {
    expect(WORK_ORDER_SELECT_NONE_VALUE).toBe("__none__");
    expect(WORK_ORDER_BILLING_LABELS.invoice).toBe("Faktura");
    expect(WORK_ORDER_DELIVERY_LABELS.pickup).toBe("Lično preuzimanje");
    expect(WORK_ORDER_STATUS_LABELS.completed).toBe("Završen");
    expect(WORK_ORDER_STATUS_VARIANTS.cancelled).toBe("destructive");
  });

  it("formats a local ISO date from a Date object", () => {
    expect(getLocalIsoDate(new Date("2025-04-07T12:00:00.000Z"))).toBe(
      "2025-04-07",
    );
  });

  it("identifies statuses that support quick completion toggling", () => {
    expect(canToggleWorkOrderCompletion("active")).toBe(true);
    expect(canToggleWorkOrderCompletion("completed")).toBe(true);
    expect(canToggleWorkOrderCompletion("draft")).toBe(false);
    expect(canToggleWorkOrderCompletion("cancelled")).toBe(false);
  });

  it("formats a work-order datetime with Serbian locale options", () => {
    const iso = "2025-04-07T13:05:00.000Z";

    expect(formatWorkOrderDateTime(iso)).toBe(
      new Date(iso).toLocaleString("sr-Latn-RS", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });

  it("formats work-order price and date strings", () => {
    expect(formatWorkOrderPrice(null)).toBe("—");
    expect(formatWorkOrderPrice(12345.5)).toBe(
      `${new Intl.NumberFormat("sr-Latn-RS", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(12345.5)} RSD`,
    );
    expect(formatWorkOrderDate("2025-04-07")).toBe("07.04.2025");
  });
});
