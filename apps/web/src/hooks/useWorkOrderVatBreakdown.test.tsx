// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWorkOrderVatBreakdown } from "./useWorkOrderVatBreakdown";
import type { BillingDocumentType, InvoiceLineItem, WorkOrder } from "@/types/work-order";

function order(
  billingDocumentType: BillingDocumentType | null,
  lineItems: Partial<InvoiceLineItem>[],
  price: number | null = 0,
): WorkOrder {
  return {
    billingDocumentType,
    price,
    invoiceDraft: {
      status: "none",
      invoiceNumber: null,
      paidAt: null,
      lineItems: lineItems as InvoiceLineItem[],
    },
  } as unknown as WorkOrder;
}

function stubCatalog(taxGroups: Record<string, string | null>) {
  const getCatalogItemById = vi.fn(async (id: string) =>
    id in taxGroups ? { id, taxGroup: taxGroups[id] } : null,
  );
  vi.stubGlobal("api", { getCatalogItemById });
  return getCatalogItemById;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWorkOrderVatBreakdown", () => {
  it("adds PDV per item rate on a faktura", async () => {
    const lookup = stubCatalog({ book: "E", print: "DJ" });
    const { result } = renderHook(() =>
      useWorkOrderVatBreakdown(
        order("invoice", [
          { catalogItemId: "book", quantity: 2, unitPrice: 500 },
          { catalogItemId: "print", quantity: 1, unitPrice: 1000 },
          { catalogItemId: null, quantity: 1, unitPrice: 100 },
        ]),
      ),
    );

    await waitFor(() =>
      expect(result.current.breakdown).toEqual({
        base: 2100,
        vatByRate: [
          { rate: 0.2, amount: 220 },
          { rate: 0.1, amount: 100 },
        ],
        vat: 320,
        total: 2420,
      }),
    );
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(result.current.rateFor("book")).toBe(0.1);
    expect(result.current.rateFor(null)).toBe(0.2);
  });

  it("takes PDV out of otkup prices", async () => {
    stubCatalog({ book: "E" });
    const { result } = renderHook(() =>
      useWorkOrderVatBreakdown(
        order("cashCollection", [
          { kind: "goods", catalogItemId: "book", quantity: 1, unitPrice: 1100 },
        ]),
      ),
    );

    await waitFor(() =>
      expect(result.current.breakdown).toEqual({
        base: 1000,
        vatByRate: [{ rate: 0.1, amount: 100 }],
        vat: 100,
        total: 1100,
      }),
    );
  });

  it("charges no PDV on otkup services, only on articles", async () => {
    stubCatalog({ book: "E", print: "DJ" });
    const { result } = renderHook(() =>
      useWorkOrderVatBreakdown(
        order("cashCollection", [
          { kind: "goods", catalogItemId: "book", quantity: 1, unitPrice: 1100 },
          { kind: "service", catalogItemId: "print", quantity: 1, unitPrice: 1200 },
          { kind: "service", catalogItemId: null, quantity: 1, unitPrice: 300 },
        ]),
      ),
    );

    await waitFor(() =>
      expect(result.current.breakdown).toEqual({
        base: 2500,
        vatByRate: [{ rate: 0.1, amount: 100 }],
        vat: 100,
        total: 2600,
      }),
    );
    expect(result.current.rateFor("print", "service")).toBe(0);
    expect(result.current.rateFor("book", "goods")).toBe(0.1);
  });

  it("falls back to the order price at 20% when there are no lines", () => {
    stubCatalog({});
    const { result } = renderHook(() =>
      useWorkOrderVatBreakdown(order("proforma", [], 1000)),
    );
    expect(result.current.breakdown.total).toBe(1200);
    expect(result.current.breakdown.vat).toBe(200);
    expect(result.current.pricesIncludeVat).toBe(false);
  });
});
