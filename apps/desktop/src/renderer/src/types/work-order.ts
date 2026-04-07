export type DeliveryMethod = 'pickup' | 'postExpress' | 'cityExpress' | 'fieldVisit'

export type BillingDocumentType = 'invoice' | 'cashCollection' | 'proforma'

export type WorkOrderStatus = 'draft' | 'active' | 'completed' | 'cancelled'

export interface Shipping {
  deliveryMethod: DeliveryMethod
}

export interface WorkOrder {
  id: string
  orderNumber: string
  clientName: string
  jobDescription: string
  billingDocumentType: BillingDocumentType
  shipping: Shipping
  /** Operator username */
  issuedBy: string
  /** ISO-8601 date string (YYYY-MM-DD) */
  issueDate: string
  /** True when the order has been completed */
  isCompleted: boolean
  status: WorkOrderStatus
  /** Null means unbilled / price not yet set */
  price: number | null
  /** ISO-8601 datetime string */
  createdAt: string
  /** ISO-8601 datetime string */
  updatedAt: string
  /** ISO-8601 date string, set when completed */
  completionDate: string | null
}

export interface CreateWorkOrderInput {
  clientName: string
  jobDescription: string
  billingDocumentType: BillingDocumentType
  shipping: Shipping
  issuedBy: string
  issueDate: string
  price: number | null
}

export interface UpdateWorkOrderInput {
  clientName?: string
  jobDescription?: string
  billingDocumentType?: BillingDocumentType
  shipping?: Shipping
  issuedBy?: string
  issueDate?: string
  isCompleted?: boolean
  status?: WorkOrderStatus
  price?: number | null
  completionDate?: string | null
}

export interface DashboardFilters {
  /** Inclusive lower bound on issueDate (YYYY-MM-DD), or null for no lower bound */
  dateFrom: string | null
  /** Inclusive upper bound on issueDate (YYYY-MM-DD), or null for no upper bound */
  dateTo: string | null
  /** Filter to a single operator; null means all operators */
  issuedBy: string | null
}

export interface DashboardSummary {
  totalOrders: number
  statusCounts: Record<WorkOrderStatus, number>
  /** Sum of price for all orders where price !== null */
  totalRevenue: number
}

export interface WorkOrderRepository {
  getAll(): Promise<WorkOrder[]>
  getOperators(): Promise<string[]>
}
