import { describe, expect, it } from "vitest";
import {
  compareWorkOrderNumbers,
  formatWorkOrderPrice,
  getWorkOrderBillingDocumentLabel,
  getWorkOrderPriorityLabel,
} from "@/shared/utils/work-orders";

describe("work order label + price helpers", () => {
  it("maps priorities to Serbian labels", () => {
    expect(getWorkOrderPriorityLabel("low")).toBe("Nizak");
    expect(getWorkOrderPriorityLabel("normal")).toBe("Normalan");
    expect(getWorkOrderPriorityLabel("high")).toBe("Visok");
    expect(getWorkOrderPriorityLabel("urgent")).toBe("Hitno");
  });

  it("maps billing document types, with blank for null", () => {
    expect(getWorkOrderBillingDocumentLabel("invoice")).toBe("Faktura");
    expect(getWorkOrderBillingDocumentLabel("cashCollection")).toBe("Otkup");
    expect(getWorkOrderBillingDocumentLabel("proforma")).toBe("Profaktura");
    expect(getWorkOrderBillingDocumentLabel(null)).toBe("");
    // Admin-defined types have no translation: the stored value is shown as-is.
    expect(getWorkOrderBillingDocumentLabel("avans")).toBe("avans");
  });

  it("formats prices with sr-Latn grouping and a dash for null", () => {
    expect(formatWorkOrderPrice(null)).toBe("-");
    expect(formatWorkOrderPrice(67000)).toBe("67.000 RSD");
    expect(formatWorkOrderPrice(1234567)).toBe("1.234.567 RSD");
  });
});

describe("compareWorkOrderNumbers", () => {
  it("orders by the embedded digits, not alphabetically", () => {
    // The whole point: plain string compare puts "10" before "9".
    expect(compareWorkOrderNumbers("RN-2026-9", "RN-2026-10")).toBeLessThan(0);
    expect(compareWorkOrderNumbers("RN-2026-10", "RN-2026-9")).toBeGreaterThan(0);
  });

  it("still orders zero-padded numbers correctly", () => {
    expect(
      compareWorkOrderNumbers("RN-2026-00009", "RN-2026-00010"),
    ).toBeLessThan(0);
  });

  it("orders by year segment before the counter", () => {
    expect(compareWorkOrderNumbers("RN-2025-00100", "RN-2026-00001")).toBeLessThan(0);
  });

  it("compares non-numeric prefixes as text", () => {
    expect(compareWorkOrderNumbers("A-1", "B-1")).toBeLessThan(0);
  });

  it("treats identical numbers as equal", () => {
    expect(compareWorkOrderNumbers("RN-2026-00001", "RN-2026-00001")).toBe(0);
  });

  it("sorts a mixed list descending, newest first", () => {
    const numbers = ["RN-2026-9", "RN-2026-11", "RN-2026-10"];
    const sorted = [...numbers].sort((a, b) => -compareWorkOrderNumbers(a, b));
    expect(sorted).toEqual(["RN-2026-11", "RN-2026-10", "RN-2026-9"]);
  });
});
