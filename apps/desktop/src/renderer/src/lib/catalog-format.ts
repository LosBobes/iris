import type { CatalogItemKind } from "@/types/catalog";
import i18n from "@/i18n";

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
    ? i18n.t("catalog.kindServiceOption")
    : i18n.t("catalog.kindArticleOption");
}
