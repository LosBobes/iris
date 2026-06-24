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
