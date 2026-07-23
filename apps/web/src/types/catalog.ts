// Catalog of admin-managed articles and services. Mirrors the CatalogItem
// schema in iris-api/openapi.yaml — a contract-sync point with the Go domain and
// the desktop model (apps/desktop/model/catalog.ts).

export type CatalogItemKind = 'service' | 'article'

export interface CatalogItem {
  id: string
  code: string
  name: string
  kind: CatalogItemKind
  unit: string
  /**
   * Cost figure: purchase price (nabavna cena) for articles, cost of labor
   * (cena rada) for services. Admin-only — the API returns null for non-admin
   * users, so operators never see cost or margin data.
   */
  purchasePrice: number | null
  /** Sale price charged to the customer (prodajna cena). */
  salePrice: number | null
  barcode: string | null
  taxGroup: string | null
  description: string | null
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CatalogItemInput {
  code: string
  name: string
  kind: CatalogItemKind
  unit: string
  purchasePrice: number | null
  salePrice: number | null
  barcode: string | null
  taxGroup: string | null
  description: string | null
  isActive: boolean
  /**
   * Date (YYYY-MM-DD) a changed price takes effect. Optional (defaults to today);
   * must be today or later. A future date schedules the new price without moving
   * the item's displayed current price until that date arrives.
   */
  effectiveFrom?: string | null
}

/**
 * One effective-dated record in a catalog item's price history. Mirrors
 * CatalogItemCost in iris-api/openapi.yaml. A null effectiveTo marks the
 * currently-effective (or scheduled future) record.
 */
export interface CatalogItemCost {
  id: string
  catalogItemId: string
  purchasePrice: number | null
  salePrice: number | null
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
}

export interface CatalogItemQuery {
  kind?: CatalogItemKind
  q?: string
  active?: boolean
  limit?: number
  offset?: number
}

export interface CatalogItemListResult {
  items: CatalogItem[]
  total: number
}
