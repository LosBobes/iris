// Shop-wide organization settings. Contract-sync point with the OrganizationSettings
// schema in iris-api/openapi.yaml and apps/desktop/model/settings.ts.

import type { BillingDocumentType, WorkOrderPriority } from '@/types/work-order'

/** Which sections of the work-order PDF/printout are rendered. */
export interface PDFSections {
  /** The delivery-method / postage checklist box. */
  delivery: boolean
  /** The billing-document box (faktura / otkup / profaktura). */
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
 * start with. Operators can always change it per order.
 */
export interface BillingDefaults {
  /** Document type new work orders start with. */
  documentType: BillingDocumentType
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

/**
 * One of the numeric columns in the work-order printout's "stavke" (line items)
 * table. The item name always leads the row, so only these three are
 * reorderable.
 */
export type PrintItemColumn = 'quantity' | 'unitPrice' | 'total'

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
   * Left-to-right order of the printout's numeric line-item columns. Always a
   * permutation of all three columns.
   */
  printItemColumns: PrintItemColumn[]
  /**
   * Whether the work-order form exposes the extra shipping/handling fields
   * (drives-out, wait-for-payment, packaging, labeling, fragile, signature,
   * insurance). Off by default so the form stays compact.
   */
  showShippingOptions: boolean
}

/** Fallback firm name used before settings load or when the request fails. */
export const DEFAULT_FIRM_NAME = 'Grafika Čobanović'

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
}

/** Proforma, used before settings load or for an unconfigured shop. */
export const DEFAULT_BILLING_DEFAULTS: BillingDefaults = {
  documentType: 'proforma',
}

/** Normal / not overridable, used before settings load or for an unconfigured shop. */
export const DEFAULT_PRIORITY_DEFAULTS: PriorityDefaults = {
  priority: 'normal',
  allowOverride: false,
}

/** Extra shipping/handling fields are hidden by default. */
export const DEFAULT_SHOW_SHIPPING_OPTIONS = false

/**
 * The shop-preferred reading order for printed line items: how many, at what
 * price, for how much.
 */
export const DEFAULT_PRINT_ITEM_COLUMNS: PrintItemColumn[] = [
  'quantity',
  'unitPrice',
  'total',
]

/**
 * Falls back to the default order when a stored/received value is not an exact
 * permutation of the three columns, so the printout never drops or duplicates a
 * column.
 */
export function normalizePrintItemColumns(
  columns: readonly PrintItemColumn[] | null | undefined,
): PrintItemColumn[] {
  if (!Array.isArray(columns)) return [...DEFAULT_PRINT_ITEM_COLUMNS]
  const unique = new Set(
    columns.filter((column) => DEFAULT_PRINT_ITEM_COLUMNS.includes(column)),
  )
  if (
    unique.size !== DEFAULT_PRINT_ITEM_COLUMNS.length ||
    columns.length !== DEFAULT_PRINT_ITEM_COLUMNS.length
  ) {
    return [...DEFAULT_PRINT_ITEM_COLUMNS]
  }
  return [...columns]
}
