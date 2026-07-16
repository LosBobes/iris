// Shop-wide organization settings. Contract-sync point with the OrganizationSettings
// schema in iris-api/openapi.yaml and apps/desktop/model/settings.ts.

import type { BillingDocumentType, WorkOrderPriority } from '@/types/work-order'

/** Which sections of the work-order PDF/printout are rendered. */
export interface PDFSections {
  /** The delivery-method / postage checklist box. */
  delivery: boolean
  /** The billing-document box (invoice / cash collection / proforma). */
  billing: boolean
  /** The notes section. */
  notes: boolean
  /** The shipping-address box. */
  shippingAddress: boolean
  /** The completion state + date row. */
  completion: boolean
  /** The issuer / executor signature lines. */
  signatures: boolean
}

/**
 * Controls the work-order document type (tip dokumenta): the value new orders
 * start with, and whether operators may change it per order.
 */
export interface BillingDefaults {
  /** Document type new work orders start with. */
  documentType: BillingDocumentType
  /** When false, the form hides the picker and always uses documentType. */
  allowOverride: boolean
}

/**
 * Controls the work-order priority (prioritet): the value new orders start
 * with, and whether operators may change it per order.
 */
export interface PriorityDefaults {
  /** Priority new work orders start with. */
  priority: WorkOrderPriority
  /** When false, the form hides the picker and always uses priority. */
  allowOverride: boolean
}

export interface OrganizationSettings {
  /** The shop's display name shown in the app branding. */
  firmName: string
  /** Work-order printout section toggles. */
  pdfSections: PDFSections
  /** Document-type default + override behavior for new work orders. */
  billingDefaults: BillingDefaults
  /** Priority default + override behavior for new work orders. */
  priorityDefaults: PriorityDefaults
  /**
   * Whether the work-order form exposes the extra shipping/handling fields
   * (drives-out, wait-for-payment, packaging, labeling, fragile, signature,
   * insurance). Off by default so the form stays compact.
   */
  showShippingOptions: boolean
  /**
   * Whether firms may have multiple locations. When false, a firm's location is
   * presented as part of the firm (single address field, no location picker);
   * when true, several locations can be managed. Off by default. Purely
   * presentational — the backend keeps locations as separate rows regardless.
   */
  allowMultipleLocations: boolean
}

/** Fallback firm name used before settings load or when the request fails. */
export const DEFAULT_FIRM_NAME = 'Grafika Čobanović'

/** All-enabled PDF sections, used before settings load or for an unconfigured shop. */
export const DEFAULT_PDF_SECTIONS: PDFSections = {
  delivery: true,
  billing: true,
  notes: true,
  shippingAddress: true,
  completion: true,
  signatures: true,
}

/** Proforma / not overridable, used before settings load or for an unconfigured shop. */
export const DEFAULT_BILLING_DEFAULTS: BillingDefaults = {
  documentType: 'proforma',
  allowOverride: false,
}

/** Normal / not overridable, used before settings load or for an unconfigured shop. */
export const DEFAULT_PRIORITY_DEFAULTS: PriorityDefaults = {
  priority: 'normal',
  allowOverride: false,
}

/** Extra shipping/handling fields are hidden by default. */
export const DEFAULT_SHOW_SHIPPING_OPTIONS = false

/**
 * Multiple locations per firm are disabled by default: a firm's location is
 * shown as part of the firm itself.
 */
export const DEFAULT_ALLOW_MULTIPLE_LOCATIONS = false
