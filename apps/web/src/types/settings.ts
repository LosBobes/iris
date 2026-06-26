// Shop-wide organization settings. Contract-sync point with the OrganizationSettings
// schema in iris-api/openapi.yaml and apps/desktop/model/settings.ts.

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

export interface OrganizationSettings {
  /** The shop's display name shown in the app branding. */
  firmName: string
  /** Work-order printout section toggles. */
  pdfSections: PDFSections
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
