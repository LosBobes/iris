export type DeliveryMethod = 'email' | 'pickup' | 'courier' | 'fax'

export type DocumentType = 'invoice' | 'receipt' | 'contract' | 'certificate'

export interface WorkOrder {
  id: string
  clientName: string
  documentType: DocumentType
  deliveryMethod: DeliveryMethod
  /** Operator username */
  issuedBy: string
  /** ISO-8601 date string (YYYY-MM-DD) */
  createdAt: string
  /** ISO-8601 date string, or null when still in progress */
  completedAt: string | null
  /** Null means unbilled / price not yet set */
  price: number | null
}

export interface DashboardFilters {
  /** Inclusive lower bound (YYYY-MM-DD), or null for no lower bound */
  dateFrom: string | null
  /** Inclusive upper bound (YYYY-MM-DD), or null for no upper bound */
  dateTo: string | null
  /** Filter to a single operator; null means all operators */
  issuedBy: string | null
}

export interface DashboardSummary {
  totalOrders: number
  completedOrders: number
  inProgressOrders: number
  /** Sum of price for all orders where price !== null */
  totalRevenue: number
}

export interface WorkOrderRepository {
  getAll(): Promise<WorkOrder[]>
  getOperators(): Promise<string[]>
}
