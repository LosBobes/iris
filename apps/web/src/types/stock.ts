// Warehouse stock ("magacin") shapes. Contract-sync point with the Stock*
// schemas in iris-api/openapi.yaml and internal/domain/types.go.
//
// Stock is a movement ledger: on-hand = SUM(quantity) of an article's movements.
// Only catalog items of kind "article" carry stock.

export type StockMovementKind = 'opening' | 'receipt' | 'consumption' | 'production' | 'adjustment'

export const STOCK_MOVEMENT_KINDS: StockMovementKind[] = [
  'opening',
  'receipt',
  'consumption',
  'production',
  'adjustment',
]

export interface StockLevel {
  catalogItemId: string
  code: string
  name: string
  unit: string
  isActive: boolean
  onHand: number
  /** Planned quantity of not-yet-consumed process inputs on open work orders. */
  reserved: number
  /** onHand - reserved */
  available: number
  minStock: number | null
  /** minStock != null && available < minStock, or onHand < 0. */
  low: boolean
  /** RFC3339 */
  lastMovementAt: string | null
}

export interface StockLevelQuery {
  search?: string
  lowOnly?: boolean
  limit?: number
  offset?: number
}

export interface StockLevelList {
  items: StockLevel[]
  total: number
}

export interface StockMovement {
  id: string
  catalogItemId: string
  itemCode: string
  itemName: string
  unit: string
  kind: StockMovementKind
  /** Signed: positive adds to stock, negative removes. */
  quantity: number
  workOrderId: string | null
  workOrderNumber: string | null
  processNodeId: string | null
  documentRef: string | null
  note: string | null
  createdAt: string
  createdBy: string
}

export interface StockMovementQuery {
  catalogItemId?: string
  workOrderId?: string
  limit?: number
  offset?: number
}

export interface StockMovementList {
  items: StockMovement[]
  total: number
}

export interface StockReceiptLine {
  catalogItemId: string
  /** > 0 */
  quantity: number
}

/** Prijem robe. 1..200 lines. */
export interface StockReceiptInput {
  documentRef?: string
  note?: string
  lines: StockReceiptLine[]
}

export interface StockCountLine {
  catalogItemId: string
  /** >= 0 */
  countedQuantity: number
}

/** Popis (admin). 1..1000 lines. Posts delta = counted - onHand per line. */
export interface StockCountInput {
  note?: string
  lines: StockCountLine[]
}

export interface StockPostingResult {
  movements: StockMovement[]
}

export const MAX_RECEIPT_LINES = 200
export const MAX_COUNT_LINES = 1000
