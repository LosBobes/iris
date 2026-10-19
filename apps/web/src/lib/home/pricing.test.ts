import { describe, expect, it } from "vitest";
import { computePricing } from "./pricing";

describe("computePricing", () => {
  it("prices a line the way an order line is priced: net, margin on revenue, PDV on top", () => {
    const result = computePricing({ quantity: 1000, unitCost: 3.2, unitPrice: 6.5, vatCode: "DJ" });
    expect(result).toEqual({
      cost: 3200,
      net: 6500,
      profit: 3300,
      marginPct: expect.closeTo(50.77, 2),
      vatRate: 0.2,
      vat: 1300,
      gross: 7800,
    });
  });

  it("applies the reduced and the zero rate", () => {
    expect(computePricing({ quantity: 10, unitCost: 1, unitPrice: 10, vatCode: "E" }).gross).toBe(110);
    expect(computePricing({ quantity: 10, unitCost: 1, unitPrice: 10, vatCode: "A" }).gross).toBe(100);
  });

  it("treats blank, negative and non-numeric input as zero and never divides by zero", () => {
    const result = computePricing({ quantity: Number.NaN, unitCost: -5, unitPrice: 0, vatCode: "DJ" });
    expect(result.cost).toBe(0);
    expect(result.net).toBe(0);
    expect(result.marginPct).toBe(0);
    expect(result.gross).toBe(0);
  });

  it("reports a negative profit when the sale price is below cost", () => {
    const result = computePricing({ quantity: 100, unitCost: 5, unitPrice: 4, vatCode: "DJ" });
    expect(result.profit).toBe(-100);
    expect(result.marginPct).toBe(-25);
  });
});
