export type DeliveryMethod = 'pickup' | 'postExpress' | 'cityExpress' | 'fieldVisit'

export type BillingDocumentType = 'invoice' | 'cashCollection' | 'proforma'

export type WorkOrderStatus = 'draft' | 'active' | 'completed' | 'cancelled'

export interface JobDetails {
  productCode: string | null
  paperWeightGsm: number | null
  dimensions: string | null
  quantity: number | null
  finishingNote: string | null
}

export interface Shipping {
  deliveryMethod: DeliveryMethod | null
  hasPackaging: boolean
  hasLabeling: boolean
  isFragile: boolean
  requiresSignature: boolean
  hasInsurance: boolean
  shippingAddress: string | null
}

export interface WorkOrder {
  id: string
  orderNumber: string
  clientName: string
  contactPerson: string | null
  jobDescription: string
  jobDetails: JobDetails | null
  billingDocumentType: BillingDocumentType | null
  billingDocumentNumber: string | null
  shipping: Shipping
  /** Operator username */
  issuedBy: string
  /** Username of person who executed the order */
  executedBy: string | null
  /** ISO-8601 date string (YYYY-MM-DD) */
  issueDate: string
  /** ISO-8601 date string (YYYY-MM-DD), optional */
  dueDate: string | null
  /** True when the order has been completed */
  isCompleted: boolean
  status: WorkOrderStatus
  /** Null means unbilled / price not yet set */
  price: number | null
  note: string | null
  /** ISO-8601 datetime string */
  createdAt: string
  /** ISO-8601 datetime string */
  updatedAt: string
  /** ISO-8601 date string, set when completed */
  completionDate: string | null
}

export interface CreateWorkOrderInput {
  clientName: string
  contactPerson: string | null
  jobDescription: string
  jobDetails: JobDetails | null
  billingDocumentType: BillingDocumentType | null
  billingDocumentNumber: string | null
  shipping: Shipping
  issuedBy: string
  issueDate: string
  dueDate: string | null
  price: number | null
  note: string | null
}

export interface UpdateWorkOrderInput {
  clientName?: string
  contactPerson?: string | null
  jobDescription?: string
  jobDetails?: JobDetails | null
  billingDocumentType?: BillingDocumentType | null
  billingDocumentNumber?: string | null
  shipping?: Shipping
  issuedBy?: string
  executedBy?: string | null
  issueDate?: string
  dueDate?: string | null
  isCompleted?: boolean
  status?: WorkOrderStatus
  price?: number | null
  note?: string | null
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
