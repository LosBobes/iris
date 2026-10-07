import { describe, expect, it } from "vitest";
import {
  addVat,
  billingDocumentIncludesVat,
  computeVatBreakdown,
  splitLineVat,
  removeVat,
  repriceForBillingDocument,
  vatRateForTaxGroup,
} from "@/shared/utils/vat";

describe("VAT helpers", () => {
  it("maps fiscal tax labels to rates, defaulting to the general 20%", () => {
    expect(vatRateForTaxGroup("DJ")).toBe(0.2);
    expect(vatRateForTaxGroup("E")).toBe(0.1);
    expect(vatRateForTaxGroup("A")).toBe(0);
    expect(vatRateForTaxGroup(null)).toBe(0.2);
    expect(vatRateForTaxGroup("legacy-7")).toBe(0.2);
  });

  it("includes VAT only for otkup", () => {
    expect(billingDocumentIncludesVat("cashCollection")).toBe(true);
    expect(billingDocumentIncludesVat("invoice")).toBe(false);
    expect(billingDocumentIncludesVat("proforma")).toBe(false);
    expect(billingDocumentIncludesVat(null)).toBe(false);
  });

  it("adds and removes VAT rounded to the para", () => {
    expect(addVat(1000, 0.2)).toBe(1200);
    expect(addVat(1000, 0.1)).toBe(1100);
    expect(addVat(333.33, 0.2)).toBe(400);
    expect(removeVat(1200, 0.2)).toBe(1000);
    expect(removeVat(1100, 0.1)).toBe(1000);
  });

  it("re-prices only when crossing the net/gross boundary", () => {
    expect(repriceForBillingDocument(1000, 0.2, "invoice", "cashCollection")).toBe(1200);
    expect(repriceForBillingDocument(1100, 0.1, "cashCollection", "proforma")).toBe(1000);
    expect(repriceForBillingDocument(1000, 0.2, "invoice", "proforma")).toBe(1000);
    expect(repriceForBillingDocument(1000, 0, "invoice", "cashCollection")).toBe(1000);
  });
});

describe("computeVatBreakdown", () => {
  it("adds PDV on top of net faktura/predračun prices", () => {
    expect(
      computeVatBreakdown([{ quantity: 2, unitPrice: 500, rate: 0.2 }], false),
    ).toEqual({ base: 1000, vatByRate: [{ rate: 0.2, amount: 200 }], vat: 200, total: 1200 });
  });

  it("takes PDV out of gross otkup prices", () => {
    expect(
      computeVatBreakdown([{ quantity: 1, unitPrice: 1200, rate: 0.2 }], true),
    ).toEqual({ base: 1000, vatByRate: [{ rate: 0.2, amount: 200 }], vat: 200, total: 1200 });
  });

  it("splits PDV per rate and leaves exempt lines in the base only", () => {
    const result = computeVatBreakdown(
      [
        { quantity: 1, unitPrice: 1000, rate: 0.1 },
        { quantity: 1, unitPrice: 1000, rate: 0.2 },
        { quantity: 3, unitPrice: 100, rate: 0 },
      ],
      false,
    );
    expect(result).toEqual({
      base: 2300,
      vatByRate: [
        { rate: 0.2, amount: 200 },
        { rate: 0.1, amount: 100 },
      ],
      vat: 300,
      total: 2600,
    });
  });

  it("returns zeros for an order with no lines", () => {
    expect(computeVatBreakdown([], false)).toEqual({ base: 0, vatByRate: [], vat: 0, total: 0 });
  });
});

describe("splitLineVat", () => {
  it("adds PDV on top of a net line", () => {
    expect(splitLineVat(6000, 0.2, false)).toEqual({ base: 6000, vat: 1200, total: 7200 });
    expect(splitLineVat(1000, 0.1, false)).toEqual({ base: 1000, vat: 100, total: 1100 });
  });

  it("takes PDV out of a gross otkup line", () => {
    expect(splitLineVat(9600, 0.2, true)).toEqual({ base: 8000, vat: 1600, total: 9600 });
    expect(splitLineVat(4950, 0.1, true)).toEqual({ base: 4500, vat: 450, total: 4950 });
  });

  it("always sums: base + vat = total", () => {
    const { base, vat, total } = splitLineVat(333.33, 0.2, true);
    expect(Math.round((base + vat) * 100) / 100).toBe(total);
  });

  it("has no PDV for exempt lines", () => {
    expect(splitLineVat(500, 0, false)).toEqual({ base: 500, vat: 0, total: 500 });
  });
});
