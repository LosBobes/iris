import type { DeliveryMethod, DocumentType } from '@/types/work-order'

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  email: 'E-pošta',
  pickup: 'Lično preuzimanje',
  courier: 'Kurir',
  fax: 'Faks'
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: 'Faktura',
  receipt: 'Račun',
  contract: 'Ugovor',
  certificate: 'Potvrda'
}
