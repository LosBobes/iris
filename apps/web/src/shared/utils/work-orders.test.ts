import { describe, expect, it } from "vitest";
import {
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
    expect(getWorkOrderBillingDocumentLabel("cashCollection")).toBe(
      "Gotovinski račun",
    );
    expect(getWorkOrderBillingDocumentLabel("proforma")).toBe("Profaktura");
    expect(getWorkOrderBillingDocumentLabel(null)).toBe("");
  });

  it("formats prices with sr-Latn grouping and a dash for null", () => {
    expect(formatWorkOrderPrice(null)).toBe("-");
    expect(formatWorkOrderPrice(67000)).toBe("67.000 RSD");
    expect(formatWorkOrderPrice(1234567)).toBe("1.234.567 RSD");
  });
});
