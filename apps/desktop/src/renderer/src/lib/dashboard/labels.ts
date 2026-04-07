import type { BillingDocumentType, DeliveryMethod, WorkOrderStatus } from '@/types/work-order'

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  pickup: 'Lično preuzimanje',
  postExpress: 'Post ekspres',
  cityExpress: 'City ekspres',
  fieldVisit: 'Izlazak na teren'
}

export const BILLING_DOCUMENT_TYPE_LABELS: Record<BillingDocumentType, string> = {
  invoice: 'Faktura',
  cashCollection: 'Otkup',
  proforma: 'Profaktura'
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: 'Nacrt',
  active: 'Aktivan',
  completed: 'Završen',
  cancelled: 'Otkazan'
}
