// Shop-wide organization settings. Contract-sync point with the
// OrganizationSettings schema in iris-api/openapi.yaml and
// apps/web/src/types/settings.ts.

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
}

/** Fallback firm name used before settings load or when the request fails. */
export const DEFAULT_FIRM_NAME = "Grafika Čobanović";

/** All-enabled PDF sections, used before settings load or for an unconfigured shop. */
export const DEFAULT_PDF_SECTIONS: PDFSections = {
  delivery: true,
  billing: true,
  notes: true,
  shippingAddress: true,
  completion: true,
  signatures: true,
};
