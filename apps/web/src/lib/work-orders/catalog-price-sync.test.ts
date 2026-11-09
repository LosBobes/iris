import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/types/catalog";
import {
  collectCatalogPriceChanges,
  netCatalogPrice,
  type PriceSyncBaseline,
} from "./catalog-price-sync";

function item(overrides: Partial<CatalogItem>): CatalogItem {
  return {
    id: "c1",
    code: "C1",
    name: "Baner",
    kind: "article",
    unit: "m2",
    purchasePrice: 400,
    salePrice: 1000,
    barcode: null,
    taxGroup: "DJ",
    description: null,
    isActive: true,
    ...overrides,
  };
}

const catalog = new Map([
  ["c1", item({})],
  ["s1", item({ id: "s1", kind: "service", salePrice: 500 })],
]);

describe("netCatalogPrice", () => {
  it("takes PDV out of an otkup article only", () => {
    expect(netCatalogPrice(1200, "goods", "cashCollection", 0.2)).toBe(1000);
    expect(netCatalogPrice(1200, "service", "cashCollection", 0.2)).toBe(1200);
    expect(netCatalogPrice(1200, "goods", "invoice", 0.2)).toBe(1200);
  });
});

describe("collectCatalogPriceChanges", () => {
  it("writes back a new line's price that differs from the catalog", () => {
    const changes = collectCatalogPriceChanges({
      lines: [{ id: "l1", kind: "goods", unitPrice: 1100, catalogItemId: "c1" }],
      billingDocumentType: "invoice",
      baseline: new Map(),
      catalogItems: catalog,
    });
    expect(changes).toEqual([{ catalogItemId: "c1", salePrice: 1100 }]);
  });

  it("stores the net price for an otkup article", () => {
    const changes = collectCatalogPriceChanges({
      lines: [{ id: "l1", kind: "goods", unitPrice: 1440, catalogItemId: "c1" }],
      billingDocumentType: "cashCollection",
      baseline: new Map(),
      catalogItems: catalog,
    });
    expect(changes).toEqual([{ catalogItemId: "c1", salePrice: 1200 }]);
  });

  it("ignores unchanged saved lines, ad-hoc lines and a document-type switch", () => {
    const baseline = new Map<string, PriceSyncBaseline>([
      ["old", { unitPrice: 800, billingDocumentType: "invoice" }],
      ["switched", { unitPrice: 1000, billingDocumentType: "invoice" }],
    ]);
    const changes = collectCatalogPriceChanges({
      lines: [
        { id: "old", kind: "goods", unitPrice: 960, catalogItemId: "c1" },
        { id: "switched", kind: "goods", unitPrice: 1200, catalogItemId: "c1" },
        { id: "adhoc", kind: "service", unitPrice: 50, catalogItemId: null },
      ],
      billingDocumentType: "cashCollection",
      baseline,
      catalogItems: catalog,
    });
    expect(changes).toEqual([]);
  });

  it("writes back an edited saved line", () => {
    const changes = collectCatalogPriceChanges({
      lines: [{ id: "old", kind: "service", unitPrice: 650, catalogItemId: "s1" }],
      billingDocumentType: "invoice",
      baseline: new Map([["old", { unitPrice: 500, billingDocumentType: "invoice" }]]),
      catalogItems: catalog,
    });
    expect(changes).toEqual([{ catalogItemId: "s1", salePrice: 650 }]);
  });
});

describe("collectSpecialLinesToCatalog", () => {
  it("picks named, priced special lines that are new or re-priced", async () => {
    const { collectSpecialLinesToCatalog } = await import("./catalog-price-sync");
    const lines = collectSpecialLinesToCatalog({
      lines: [
        { id: "new", kind: "service", description: "Montaža", unitPrice: 2000 },
        { id: "unnamed", kind: "service", description: " ", unitPrice: 2000 },
        { id: "free", kind: "goods", description: "Uzorak", unitPrice: 0 },
        { id: "same", kind: "service", description: "Dostava", unitPrice: 500 },
        { id: "edited", kind: "service", description: "Dizajn", unitPrice: 3000 },
        { id: "cat", kind: "service", description: "Baner", unitPrice: 9, catalogItemId: "c1" },
      ],
      billingDocumentType: "invoice",
      baseline: new Map([
        ["same", { unitPrice: 500, billingDocumentType: "invoice" }],
        ["edited", { unitPrice: 2500, billingDocumentType: "invoice" }],
      ]),
    });
    expect(lines.map((line) => line.id)).toEqual(["new", "edited"]);
  });
});

describe("repriceOrderLines", () => {
  it("moves an open order's matching lines to the new price, gross on otkup", async () => {
    const { repriceOrderLines } = await import("./catalog-price-sync");
    const order = {
      billingDocumentType: "cashCollection",
      invoiceDraft: {
        lineItems: [
          { id: "a", kind: "goods", description: "Baner", quantity: 2, unit: "m2", unitPrice: 1200, unitCost: null, catalogItemId: "c1" },
          { id: "b", kind: "service", description: "Montaža", quantity: 1, unit: "kom", unitPrice: 500, unitCost: null, catalogItemId: null },
        ],
      },
    } as unknown as import("@/types/work-order").WorkOrder;
    const change = {
      catalogItemId: "c1",
      name: "Baner",
      kind: "article" as const,
      previousSalePrice: 1000,
      salePrice: 1100,
      rate: 0.2,
    };
    const result = repriceOrderLines(order, new Map([["c1", change]]));
    expect(result?.lineItems[0].unitPrice).toBe(1320);
    expect(result?.lineItems[1].unitPrice).toBe(500);
    expect(result?.price).toBe(3140);
    expect(repriceOrderLines(order, new Map())).toBeNull();
  });
});
