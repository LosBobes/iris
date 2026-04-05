// Shared domain types used by both the main process and the renderer.
// Keep in sync with src/renderer/src/types/work-order.ts.

export type DeliveryMethod = 'email' | 'pickup' | 'courier' | 'fax'

export type DocumentType = 'invoice' | 'receipt' | 'contract' | 'certificate'

export interface WorkOrder {
  id: string
  clientName: string
  documentType: DocumentType
  deliveryMethod: DeliveryMethod
  issuedBy: string
  createdAt: string
  completedAt: string | null
  price: number | null
}
