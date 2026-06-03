export type DeliveryMethod = 'pickup' | 'postExpress' | 'cityExpress' | 'fieldVisit'

export type BillingDocumentType = 'invoice' | 'cashCollection' | 'proforma'

export type WorkOrderStatus =
  | 'new'
  | 'assigned'
  | 'inProgress'
  | 'waitingForCustomer'
  | 'waitingForMaterials'
  | 'completed'
  | 'cancelled'
  | 'invoiced'

export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent'
export type WorkOrderNoteVisibility = 'internal' | 'customer'
export type InvoiceDraftStatus = 'none' | 'draft' | 'issued' | 'paid'
export type InvoiceLineItemKind = 'service' | 'goods'
export type InvoiceUnit = 'kom' | 'm2' | 'set'

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

export interface Customer {
  id: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
}

export interface Location {
  id: string
  customerId: string
  name: string
  address: string | null
}

export interface Assignment {
  assignedTo: string | null
  priority: WorkOrderPriority
  scheduledDate: string | null
}

export interface WorkOrderStatusHistory {
  status: WorkOrderStatus
  changedAt: string
  changedBy: string
}

export interface Attachment {
  id: string
  fileName: string
  fileType: string
  url: string | null
  uploadedAt: string
}

export interface WorkOrderNote {
  id: string
  visibility: WorkOrderNoteVisibility
  author: string
  body: string
  createdAt: string
}

export interface WorkOrderEvent {
  id: string
  kind: string
  label: string
  actor: string
  createdAt: string
}

export interface MaterialUsage {
  id: string
  name: string
  quantity: number
  unit: string
  unitCost: number | null
}

export interface TimeEntry {
  id: string
  operator: string
  minutes: number
  loggedAt: string
}

export interface InvoiceLineItem {
  id: string
  kind: InvoiceLineItemKind
  description: string
  quantity: number
  unit: InvoiceUnit
  unitPrice: number
}

export interface InvoiceDraft {
  status: InvoiceDraftStatus
  invoiceNumber: string | null
  lineItems: InvoiceLineItem[]
  paidAt: string | null
}

export interface CustomerCommunication {
  publicToken: string
  notificationEmail: string | null
  emailNotificationsEnabled: boolean
  signedBy: string | null
  signedAt: string | null
}

export interface WorkOrder {
  id: string
  orderNumber: string
  customerId: string | null
  locationId: string | null
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
  assignment: Assignment
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
  statusHistory: WorkOrderStatusHistory[]
  internalNotes: WorkOrderNote[]
  customerNotes: WorkOrderNote[]
  events: WorkOrderEvent[]
  attachments: Attachment[]
  materialUsage: MaterialUsage[]
  timeEntries: TimeEntry[]
  invoiceDraft: InvoiceDraft
  communication: CustomerCommunication
}

export interface CreateWorkOrderInput {
  customerId: string | null
  locationId: string | null
  clientName: string
  contactPerson: string | null
  jobDescription: string
  jobDetails: JobDetails | null
  billingDocumentType: BillingDocumentType | null
  billingDocumentNumber: string | null
  shipping: Shipping
  assignment: Assignment
  issuedBy: string
  issueDate: string
  dueDate: string | null
  price: number | null
  note: string | null
  internalNotes: WorkOrderNote[]
  customerNotes: WorkOrderNote[]
  attachments: Attachment[]
  materialUsage: MaterialUsage[]
  timeEntries: TimeEntry[]
  invoiceDraft: InvoiceDraft
  communication: CustomerCommunication
}

export interface UpdateWorkOrderInput {
  customerId?: string | null
  locationId?: string | null
  clientName?: string
  contactPerson?: string | null
  jobDescription?: string
  jobDetails?: JobDetails | null
  billingDocumentType?: BillingDocumentType | null
  billingDocumentNumber?: string | null
  shipping?: Shipping
  assignment?: Assignment
  issuedBy?: string
  executedBy?: string | null
  issueDate?: string
  dueDate?: string | null
  isCompleted?: boolean
  status?: WorkOrderStatus
  price?: number | null
  note?: string | null
  completionDate?: string | null
  statusHistory?: WorkOrderStatusHistory[]
  internalNotes?: WorkOrderNote[]
  customerNotes?: WorkOrderNote[]
  events?: WorkOrderEvent[]
  attachments?: Attachment[]
  materialUsage?: MaterialUsage[]
  timeEntries?: TimeEntry[]
  invoiceDraft?: InvoiceDraft
  communication?: CustomerCommunication
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

export interface WorkOrderListQuery {
  search?: string
  status?: WorkOrderStatus
  assignedTo?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
  sort?: string
}

export interface WorkOrderListResult {
  items: WorkOrder[]
  total: number
}

export interface PublicWorkOrderStatus {
  orderNumber: string
  clientName: string
  jobDescription: string
  status: WorkOrderStatus
  dueDate: string | null
  customerNoteCount: number
  internalNoteCount: number
  signedBy: string | null
  signedAt: string | null
}
