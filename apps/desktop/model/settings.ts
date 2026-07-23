// Shop-wide organization settings. Contract-sync point with the
// OrganizationSettings schema in iris-api/openapi.yaml and
// apps/web/src/types/settings.ts.

import type { BillingDocumentType } from "./work-order";

/** Which sections of the work-order PDF/printout are rendered. */
export interface PDFSections {
  delivery: boolean;
  billing: boolean;
  notes: boolean;
  shippingAddress: boolean;
  completion: boolean;
  signatures: boolean;
}

/**
 * Controls the work-order document type (tip dokumenta): the value new orders
 * start with, and whether operators may change it per order.
 */
export interface BillingDefaults {
  /** Document type new work orders start with. */
  documentType: BillingDocumentType;
  /** When false, the form hides the picker and always uses documentType. */
  allowOverride: boolean;
}

/**
 * Controls the work-order priority (prioritet): the value new orders start
 * with, and whether operators may change it per order.
 */
export interface PriorityDefaults {
  /** Priority new work orders start with. */
  priority: "low" | "normal" | "high" | "urgent";
  /** When false, the form hides the picker and always uses priority. */
  allowOverride: boolean;
}

export interface OrganizationSettings {
  /** The shop's display name shown in the app branding. */
  firmName: string;
  /** Work-order printout section toggles. */
  pdfSections: PDFSections;
  /** Document-type default + override behavior for new work orders. */
  billingDefaults: BillingDefaults;
  /** Priority default + override behavior for new work orders. */
  priorityDefaults: PriorityDefaults;
  /**
   * Whether the work-order form exposes the extra shipping/handling fields.
   * Off by default. Configured via the web settings UI.
   */
  showShippingOptions: boolean;
}

/** Fallback firm name used before settings load or when the request fails. */
export const DEFAULT_FIRM_NAME = "Grafika Čobanović";

/**
 * Default PDF sections, used before settings load or for an unconfigured shop.
 * Every section is on except notes (napomena), which a shop opts into.
 */
export const DEFAULT_PDF_SECTIONS: PDFSections = {
  delivery: true,
  billing: true,
  notes: false,
  shippingAddress: true,
  completion: true,
  signatures: true,
};

/** Proforma / not overridable, used before settings load or for an unconfigured shop. */
export const DEFAULT_BILLING_DEFAULTS: BillingDefaults = {
  documentType: "proforma",
  allowOverride: false,
};

/** Normal / not overridable, used before settings load or for an unconfigured shop. */
export const DEFAULT_PRIORITY_DEFAULTS: PriorityDefaults = {
  priority: "normal",
  allowOverride: false,
};

/** Extra shipping/handling fields are hidden by default. */
export const DEFAULT_SHOW_SHIPPING_OPTIONS = false;
