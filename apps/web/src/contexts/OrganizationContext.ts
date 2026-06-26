import { createContext } from 'react'
import {
  DEFAULT_FIRM_NAME,
  DEFAULT_PDF_SECTIONS,
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
}

export const OrganizationContext = createContext<OrganizationContextValue>({
  firmName: DEFAULT_FIRM_NAME,
  setFirmName: () => {},
  pdfSections: DEFAULT_PDF_SECTIONS,
  setPdfSections: () => {},
})
