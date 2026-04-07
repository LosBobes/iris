// Shared domain types used by both the main process and the renderer.
// Keep in sync with src/renderer/src/types/work-order.ts.

export type DeliveryMethod = 'pickup' | 'postExpress' | 'cityExpress' | 'fieldVisit'

export type BillingDocumentType = 'invoice' | 'cashCollection' | 'proforma'

export type WorkOrderStatus = 'draft' | 'active' | 'completed' | 'cancelled'

export interface Shipping {
  deliveryMethod: DeliveryMethod
}

export interface WorkOrder {
  id: string
  clientName: string
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
}
