import type { CatalogItem, CatalogItemInput, CatalogItemKind } from "@/types/catalog";

export const emptyCatalogItem: CatalogItem = {
  id: "",
  code: "",
  name: "",
  kind: "service",
  unit: "kom",
  purchasePrice: null,
  salePrice: null,
  barcode: null,
  taxGroup: null,
  description: null,
  isActive: true,
};

/**
 * Label for the cost field, which differs by kind: articles have a purchase
 * price (nabavna cena), services a cost of labor (cena rada).
 */
export function costPriceLabel(kind: CatalogItemKind): string {
  return kind === "service" ? "Cena rada (RSD)" : "Nabavna cena (RSD)";
}

const priceFormatter = new Intl.NumberFormat("sr-RS", {
  style: "currency",
  currency: "RSD",
  maximumFractionDigits: 2,
});

export function formatCatalogPrice(price: number | null): string {
  if (price === null) return "—";
  return priceFormatter.format(price);
}

export function kindLabel(kind: CatalogItemKind): string {
  return kind === "service" ? "Usluga" : "Artikal";
}

/** Maps an editable catalog item to the input payload the API expects. */
export function toCatalogInput(item: CatalogItem): CatalogItemInput {
  return {
    code: item.code.trim(),
    name: item.name.trim(),
    kind: item.kind,
    unit: item.unit.trim() || "kom",
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    barcode: blankToNull(item.barcode),
    taxGroup: blankToNull(item.taxGroup),
    description: blankToNull(item.description),
    isActive: item.isActive,
  };
}

export function blankToNull(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  return value;
}

export function formatActionError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}
