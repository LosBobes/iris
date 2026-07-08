// Shop-wide organization settings (renderer view). Mirrors model/settings.ts and
// the OrganizationSettings schema in iris-api/openapi.yaml.

/** Which sections of the work-order PDF/printout are rendered. */
export interface PDFSections {
  delivery: boolean;
  billing: boolean;
  notes: boolean;
  shippingAddress: boolean;
  completion: boolean;
  signatures: boolean;
}

export interface OrganizationSettings {
  /** The shop's display name shown in the app branding. */
  firmName: string;
  /** Work-order printout section toggles. */
  pdfSections: PDFSections;
  /**
   * When true, the shop issues only proformas (profaktura/predračun) and never
   * invoices — clients hide the invoice document type. Defaults on for Grafika
   * Čobanović, whose current process has no invoices.
   */
  proformaOnly: boolean;
}

/** Fallback firm name used before settings load or when the request fails. */
export const DEFAULT_FIRM_NAME = "Grafika Čobanović";

/** Default proforma-only mode: this shop issues only proformas, no invoices. */
export const DEFAULT_PROFORMA_ONLY = true;

/** All-enabled PDF sections, used before settings load or for an unconfigured shop. */
export const DEFAULT_PDF_SECTIONS: PDFSections = {
  delivery: true,
  billing: true,
  notes: true,
  shippingAddress: true,
  completion: true,
  signatures: true,
};
