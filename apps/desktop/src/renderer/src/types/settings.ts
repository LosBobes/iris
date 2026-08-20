// Shop-wide organization settings (renderer view). Mirrors model/settings.ts and
// the OrganizationSettings schema in iris-api/openapi.yaml.

import type { BillingDocumentType } from "./work-order";

/**
 * Which optional sections of the work-order PDF/printout are rendered.
 *
 * The napomena (notes) box is deliberately absent: it is the only destination
 * for a work order's free-text note, so hiding it would leave the form's
 * napomena field writing to nowhere. It always renders.
 */
export interface PDFSections {
  delivery: boolean;
  billing: boolean;
  shippingAddress: boolean;
  completion: boolean;
  signatures: boolean;
}

/**
 * Controls the work-order document type (tip dokumenta): the value new orders
 * start with. Operators can always change it per order.
 */
export interface BillingDefaults {
  /** Document type new work orders start with. */
  documentType: BillingDocumentType;
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

/**
 * One of the numeric columns in the work-order printout's "stavke" (line items)
 * table. The item name always leads the row, so only these three are
 * reorderable.
 */
export type PrintItemColumn = "quantity" | "unitPrice" | "total";

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
   * Left-to-right order of the printout's numeric line-item columns. Always a
   * permutation of all three columns.
   */
  printItemColumns: PrintItemColumn[];
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
 * Every optional section is on.
 */
export const DEFAULT_PDF_SECTIONS: PDFSections = {
  delivery: true,
  billing: true,
  shippingAddress: true,
  completion: true,
  signatures: true,
};

/** Proforma, used before settings load or for an unconfigured shop. */
export const DEFAULT_BILLING_DEFAULTS: BillingDefaults = {
  documentType: "proforma",
};

/** Normal / not overridable, used before settings load or for an unconfigured shop. */
export const DEFAULT_PRIORITY_DEFAULTS: PriorityDefaults = {
  priority: "normal",
  allowOverride: false,
};

/** Extra shipping/handling fields are hidden by default. */
export const DEFAULT_SHOW_SHIPPING_OPTIONS = false;

/**
 * The shop-preferred reading order for printed line items: how many, at what
 * price, for how much.
 */
export const DEFAULT_PRINT_ITEM_COLUMNS: PrintItemColumn[] = [
  "quantity",
  "unitPrice",
  "total",
];
