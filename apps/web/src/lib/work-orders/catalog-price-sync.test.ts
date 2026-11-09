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
