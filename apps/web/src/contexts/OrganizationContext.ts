import { createContext } from 'react'
import {
  DEFAULT_BILLING_DEFAULTS,
  DEFAULT_FIRM_NAME,
  DEFAULT_PDF_SECTIONS,
  DEFAULT_PRIORITY_DEFAULTS,
  DEFAULT_SHOW_SHIPPING_OPTIONS,
  type BillingDefaults,
  type PDFSections,
  type PriorityDefaults,
} from '@/types/settings'

export interface OrganizationContextValue {
  /** The shop's display name shown in the app branding. */
  firmName: string
  /** Updates the in-memory firm name after a successful save. */
  setFirmName: (firmName: string) => void
  /** Which work-order PDF sections are enabled shop-wide. */
  pdfSections: PDFSections
  /** Updates the in-memory PDF section toggles after a successful save. */
  setPdfSections: (pdfSections: PDFSections) => void
  /** Document-type default + override behavior for new work orders. */
  billingDefaults: BillingDefaults
  /** Updates the in-memory billing defaults after a successful save. */
  setBillingDefaults: (billingDefaults: BillingDefaults) => void
  /** Priority default + override behavior for new work orders. */
  priorityDefaults: PriorityDefaults
  /** Updates the in-memory priority defaults after a successful save. */
  setPriorityDefaults: (priorityDefaults: PriorityDefaults) => void
  /** Whether the work-order form exposes the extra shipping/handling fields. */
  showShippingOptions: boolean
  /** Updates the in-memory shipping-options toggle after a successful save. */
  setShowShippingOptions: (showShippingOptions: boolean) => void
}

export const OrganizationContext = createContext<OrganizationContextValue>({
  firmName: DEFAULT_FIRM_NAME,
  setFirmName: () => {},
  pdfSections: DEFAULT_PDF_SECTIONS,
  setPdfSections: () => {},
  billingDefaults: DEFAULT_BILLING_DEFAULTS,
  setBillingDefaults: () => {},
  priorityDefaults: DEFAULT_PRIORITY_DEFAULTS,
  setPriorityDefaults: () => {},
  showShippingOptions: DEFAULT_SHOW_SHIPPING_OPTIONS,
  setShowShippingOptions: () => {},
})
