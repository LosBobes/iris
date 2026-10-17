import { z } from 'zod'
import { MAX_COUNT_LINES, MAX_RECEIPT_LINES } from '@/types/stock'

/** Parses a typed quantity ("12", "12.5", "12,5"); null when empty or not a finite number. */
export function parseQuantityInput(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export interface ReceiptValidationMessages {
  documentRefTooLong: string
  noteTooLong: string
  linesRequired: string
  tooManyLines: string
  articleRequired: string
  quantityPositive: string
  duplicate: string
}

export const receiptLineSchema = (messages: ReceiptValidationMessages) =>
  z.object({
    catalogItemId: z.string().min(1, messages.articleRequired),
    // Display data carried with the line for the on-hand preview.
    name: z.string(),
    code: z.string(),
    unit: z.string(),
    onHand: z.number(),
    quantity: z.string().refine((raw) => {
      const value = parseQuantityInput(raw)
      return value !== null && value > 0
    }, messages.quantityPositive),
  })

/** Goods-receipt form: validated before anything goes over the API. */
export const receiptSchema = (messages: ReceiptValidationMessages) =>
  z.object({
    documentRef: z.string().max(120, messages.documentRefTooLong),
    note: z.string().max(500, messages.noteTooLong),
    lines: z
      .array(receiptLineSchema(messages))
      .min(1, messages.linesRequired)
      .max(MAX_RECEIPT_LINES, messages.tooManyLines)
      .superRefine((lines, ctx) => {
        const seen = new Set<string>()
        lines.forEach((line, index) => {
          if (line.catalogItemId && seen.has(line.catalogItemId)) {
            ctx.addIssue({ code: 'custom', message: messages.duplicate, path: [index, 'catalogItemId'] })
          }
          seen.add(line.catalogItemId)
        })
      }),
  })

export type ReceiptFormValues = z.infer<ReturnType<typeof receiptSchema>>

/** Counted lines of a stocktake: quantities are >= 0, 1..1000 lines. */
export const countLinesSchema = (negativeMessage: string, emptyMessage: string) =>
  z
    .array(
      z.object({
        catalogItemId: z.string().min(1),
        countedQuantity: z.number().min(0, negativeMessage),
      }),
    )
    .min(1, emptyMessage)
    .max(MAX_COUNT_LINES)

/** Catalog minimum stock: a non-negative number, or null for "no threshold". */
export const minStockSchema = z.number().min(0).nullable()
