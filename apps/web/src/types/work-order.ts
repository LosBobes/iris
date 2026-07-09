// The delivery, postage, billing, and priority fields accept admin-defined
// custom values in addition to the built-in defaults. The `(string & {})` arm
// keeps editor autocomplete for the built-ins while still allowing any custom
// value the administrator adds via Settings.
export type DeliveryMethod =
  | 'pickup'
  | 'postExpress'
  | 'cityExpress'
  | 'fieldVisit'
  | (string & {})

export type PostagePaymentType =
  | 'cod'
  | 'ourAccount'
  | 'advance'
  | 'viaInvoice'
  | (string & {})

export type BillingDocumentType =
  | 'invoice'
  | 'cashCollection'
  | 'proforma'
  | (string & {})

export type WorkOrderStatus =
  | 'new'
  | 'assigned'
  | 'inProgress'
  | 'completed'
  | 'cancelled'
  | 'invoiced'

export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent' | (string & {})

export type EnumField =
  | 'deliveryMethod'
  | 'postagePaymentType'
  | 'billingDocumentType'
  | 'priority'
  | 'invoiceUnit'

export interface EnumValue {
  id: string
  field: EnumField
  value: string
  label: string
  sortOrder: number
  isBuiltin: boolean
  createdAt?: string
  updatedAt?: string
}

export interface EnumValueInput {
  field: EnumField
  value: string
  label: string
  sortOrder: number
}
export type WorkOrderNoteVisibility = 'internal' | 'customer'
export type InvoiceDraftStatus = 'none' | 'draft' | 'issued' | 'paid'
export type InvoiceLineItemKind = 'service' | 'goods'
// Built-in units of measure. The field is admin-extensible via the
// `invoiceUnit` managed enum, so stored values may be any non-empty string.
export type BuiltinInvoiceUnit = 'kom' | 'm2' | 'set'
export type InvoiceUnit = string

export interface JobDetails {
  productCode: string | null
  paperWeightGsm: number | null
  dimensions: string | null
  quantity: number | null
  finishingNote: string | null
}

export interface Shipping {
  deliveryMethod: DeliveryMethod | null
  drivesOut: boolean
  postagePaymentType: PostagePaymentType | null
  waitForPayment: boolean
  hasPackaging: boolean
  hasLabeling: boolean
  isFragile: boolean
  requiresSignature: boolean
  hasInsurance: boolean
  shippingAddress: string | null
}

export interface CustomerEmail {
  id: string
  email: string
  // Optional free-text tag, e.g. "Računovodstvo".
  label: string | null
  sortOrder: number
}

export interface CustomerContact {
  id: string
  name: string
  email: string | null
  phone: string | null
  // Optional job title or role of the contact person.
  role: string | null
  sortOrder: number
}

export interface Customer {
  id: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  // Serbian firm identifiers. Optional on imported records; validated when set.
  // PIB: 9 digits + ISO 7064 MOD 11,10 control digit. MB: exactly 8 digits.
  pib: string | null
  mb: string | null
  // 1-N child collections. The legacy single contactName/email/phone fields
  // above are kept for back-compat and seeded into these by the API migration.
  emails: CustomerEmail[]
  contacts: CustomerContact[]
}

export interface Location {
  id: string
  customerId: string
  name: string
  address: string | null
}

export interface CustomerListQuery {
  q?: string
  limit?: number
  offset?: number
}

export interface CustomerListResult {
  items: Customer[]
  total: number
}

export interface Assignment {
  assignedTo: string | null
  priority: WorkOrderPriority
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
  // Per-unit cost frozen onto the line at save time: catalog cost as of the
  // issue date (re-snapshot to completion date on completion) for catalog lines,
  // or an admin-entered value for ad-hoc lines. null = cost not yet captured
  // (ad-hoc line awaiting admin review), distinct from a genuine 0. Admin-only:
  // the API returns null for non-admin users. Margin = unitPrice - unitCost.
  unitCost?: number | null
  // Set when the line was picked from the catalog; null for ad-hoc services.
  catalogItemId?: string | null
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
  /** Deadline to issue the proforma invoice (predračun); YYYY-MM-DD or null */
  proformaDueDate: string | null
  /** Deadline to finish the job; YYYY-MM-DD or null */
  dueDate: string | null
  /** True when the order has been completed */
  isCompleted: boolean
  status: WorkOrderStatus
  /** Null means unbilled / price not yet set */
  price: number | null
  /**
   * Cached margin: sum of (unitPrice - unitCost) * quantity over line items
   * with a captured cost, recomputed server-side on every save. Provisional
   * while needsCostReview is true. Admin-only — null/absent for non-admin users.
   */
  profit?: number | null
  /**
   * True when any line item has no captured cost (usually ad-hoc lines). Such
   * orders save normally but appear in the admin cost-review queue until an
   * admin enters the missing costs. Admin-only — false for non-admin users.
   */
  needsCostReview?: boolean
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

export interface ReservedOrderNumber {
  orderNumber: string
  expiresAt: string
}

/**
 * EditLock is an exclusive editing claim on a work order so only one operator
 * edits it at a time. `lockedBy` is the holder's username. On the holder's own
 * lock `expiresAt` is set; on a rejection describing another holder it is empty.
 */
export interface EditLock {
  workOrderId: string
  lockedBy: string
  lockedAt: string
  expiresAt: string
}

/**
 * Result of acquiring/refreshing an edit lock. `acquired` is true when the caller
 * holds the lock; when false, `lock` describes the operator currently editing.
 */
export interface EditLockResult {
  acquired: boolean
  lock: EditLock
}

export interface CreateWorkOrderInput {
  /**
   * Order number previously handed out by reserveWorkOrderNumber and shown in the
   * create-form header. Consumed if its reservation still stands, otherwise the
   * server allocates a fresh one.
   */
  orderNumber?: string | null
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
  executedBy?: string | null
  issueDate: string
  proformaDueDate: string | null
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
  proformaDueDate?: string | null
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
  /** Admin-only: when true, returns only orders awaiting cost entry. */
  needsCostReview?: boolean
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
