import { format, parse } from "date-fns";
import i18n from "@/i18n";
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
  return kind === "service"
    ? i18n.t("catalog.costLabelService")
    : i18n.t("catalog.costLabelArticle");
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
  return kind === "service"
    ? i18n.t("catalog.kindService")
    : i18n.t("catalog.kindArticle");
}

/**
 * Maps an editable catalog item to the input payload the API expects.
 * effectiveFrom (optional, YYYY-MM-DD) is the date a changed price takes effect;
 * omit it (or pass undefined) to default to today on the server.
 */
export function toCatalogInput(
  item: CatalogItem,
  effectiveFrom?: string | null,
): CatalogItemInput {
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
    effectiveFrom: effectiveFrom ?? undefined,
  };
}

/** Formats a stored YYYY-MM-DD date for display as DD.MM.YYYY. */
export function formatEffectiveDate(iso: string): string {
  const parsed = parse(iso, "yyyy-MM-dd", new Date());
  if (Number.isNaN(parsed.getTime())) return iso;
  return format(parsed, "dd.MM.yyyy");
}

/** Today as a stored YYYY-MM-DD string (local time), matching DatePicker output. */
export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
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
