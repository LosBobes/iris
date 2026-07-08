import { createContext } from 'react'
import {
  DEFAULT_FIRM_NAME,
  DEFAULT_PDF_SECTIONS,
  DEFAULT_PROFORMA_ONLY,
  type PDFSections,
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
  /** Whether this shop only ever issues proformas (never invoices). */
  proformaOnly: boolean
  /** Updates the in-memory proforma-only flag after a successful save. */
  setProformaOnly: (proformaOnly: boolean) => void
}

export const OrganizationContext = createContext<OrganizationContextValue>({
  firmName: DEFAULT_FIRM_NAME,
  setFirmName: () => {},
  pdfSections: DEFAULT_PDF_SECTIONS,
  setPdfSections: () => {},
  proformaOnly: DEFAULT_PROFORMA_ONLY,
  setProformaOnly: () => {},
})
