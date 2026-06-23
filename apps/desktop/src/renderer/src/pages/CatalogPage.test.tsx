import { describe, expect, it } from "vitest";
import { formatCatalogPrice, kindLabel } from "@/lib/catalog-format";

describe("formatCatalogPrice", () => {
  it("renders an em dash for a missing price", () => {
    expect(formatCatalogPrice(null)).toBe("—");
  });

  it("formats a numeric price as RSD currency", () => {
    const formatted = formatCatalogPrice(1200);
    expect(formatted).toContain("1.200");
    expect(formatted.toUpperCase()).toContain("RSD");
  });
});

describe("kindLabel", () => {
  it("maps catalog kinds to Serbian labels", () => {
    expect(kindLabel("service")).toBe("Usluga");
    expect(kindLabel("article")).toBe("Artikal");
  });
});
