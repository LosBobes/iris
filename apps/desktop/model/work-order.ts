// Shared domain types used by both the main process and the renderer.
// Keep in sync with src/renderer/src/types/work-order.ts.

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
  /** Deadline to issue the proforma invoice (predračun); YYYY-MM-DD or null */
  proformaDueDate: string | null
  /** Deadline to finish the job; YYYY-MM-DD or null */
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
  clientName: string
  contactPerson: string | null
  jobDescription: string
  jobDetails: JobDetails | null
  billingDocumentType: BillingDocumentType | null
  billingDocumentNumber: string | null
  shipping: Shipping
  issuedBy: string
  executedBy?: string | null
  issueDate: string
  proformaDueDate: string | null
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
  proformaDueDate?: string | null
  dueDate?: string | null
  isCompleted?: boolean
  status?: WorkOrderStatus
  price?: number | null
  note?: string | null
  completionDate?: string | null
}
