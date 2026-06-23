// Renderer copy of the catalog contract. Mirrors apps/desktop/model/catalog.ts
// and apps/web/src/types/catalog.ts.

export type CatalogItemKind = "service" | "article";

export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  kind: CatalogItemKind;
  unit: string;
  /** Cost (nabavna cena / cena rada). Admin-only — null for non-admin users. */
  purchasePrice: number | null;
  /** Sale price (prodajna cena). */
  salePrice: number | null;
  barcode: string | null;
  taxGroup: string | null;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogItemInput {
  code: string;
  name: string;
  kind: CatalogItemKind;
  unit: string;
  /** Cost (nabavna cena / cena rada). Admin-only — null for non-admin users. */
  purchasePrice: number | null;
  /** Sale price (prodajna cena). */
  salePrice: number | null;
  barcode: string | null;
  taxGroup: string | null;
  description: string | null;
  isActive: boolean;
}

export interface CatalogItemQuery {
  kind?: CatalogItemKind;
  q?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export interface CatalogItemListResult {
  items: CatalogItem[];
  total: number;
}
