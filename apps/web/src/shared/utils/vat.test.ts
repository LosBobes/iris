import { describe, expect, it } from "vitest";
import {
  addVat,
  billingDocumentIncludesVat,
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
