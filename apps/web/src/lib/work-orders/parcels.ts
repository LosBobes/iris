import type { Shipping } from '@/types/work-order'

// The packages an order is sent in, as printed in the "PAKETI" box and shown on
// the detail page. TypeScript twin of ResolvePrintParcels in
// iris-api/internal/reports/work_order_pdf.go — keep them in step.
export interface PrintParcels {
  /** Number of packages, or a blank line. */
  count: string
  /** Per package (a blank line until weighed), or blank lines. */
  weights: string[]
  /** Many packages: the weights print as one wrapped line. */
  compact: boolean
  /** Null until every package is weighed. */
  totalWeight: string | null
  /** Estimated postage, or a blank line. */
  postage: string
  /** No packages entered: spaced out for handwriting. */
  blank: boolean
}

/** Printed where a value is to be written in by hand. */
export const PRINT_BLANK = '______'
/** Blank weight lines for an order sent with no packages entered. */
export const PRINT_BLANK_PACKAGE_LINES = 5
/** From this many packages the weights print on one wrapped line. */
export const PRINT_PARCELS_COMPACT_FROM = 9

const quantityFormat = new Intl.NumberFormat('sr-Latn-RS', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

const amountFormat = new Intl.NumberFormat('sr-Latn-RS', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Whether the order is sent to the client (any delivery method but pickup). */
export function isShippingSent(shipping: Shipping): boolean {
  return Boolean(shipping.deliveryMethod) && shipping.deliveryMethod !== 'pickup'
}

/**
 * The "PAKETI" box. An order that is sent always gets it, with blank lines for
 * whatever is not entered so the packer can write it in by pen; any other order
 * only when packages or postage were entered. Null means no box.
 */
export function getPrintParcels(shipping: Shipping): PrintParcels | null {
  const packages = shipping.packages ?? []
  const postage = shipping.estimatedPostage ?? null
  const hasData = packages.length > 0 || postage !== null
  if (!hasData && !isShippingSent(shipping)) return null

  const parcels: PrintParcels = {
    count: PRINT_BLANK,
    weights: Array.from({ length: PRINT_BLANK_PACKAGE_LINES }, () => PRINT_BLANK),
    compact: false,
    totalWeight: null,
    postage: postage === null ? PRINT_BLANK : amountFormat.format(postage),
    blank: packages.length === 0,
  }
  if (packages.length > 0) {
    let total = 0
    let allWeighed = true
    parcels.count = String(packages.length)
    parcels.compact = packages.length >= PRINT_PARCELS_COMPACT_FROM
    parcels.weights = packages.map((pkg) => {
      if (pkg.weightKg === null) {
        allWeighed = false
        return PRINT_BLANK
      }
      total += pkg.weightKg
      return quantityFormat.format(pkg.weightKg)
    })
    parcels.totalWeight = allWeighed ? quantityFormat.format(total) : null
  }
  return parcels
}

/** One-line summary for the detail page, e.g. "2 kom (1,5 kg; ? kg)". */
export function formatParcelSummary(shipping: Shipping): string | null {
  const packages = shipping.packages ?? []
  if (packages.length === 0) return null
  const weights = packages.map((pkg) =>
    pkg.weightKg === null ? '? kg' : `${quantityFormat.format(pkg.weightKg)} kg`,
  )
  return `${packages.length} kom (${weights.join('; ')})`
}

/** The estimated postage for the detail page, e.g. "650 RSD". */
export function formatPostageSummary(shipping: Shipping): string | null {
  const postage = shipping.estimatedPostage ?? null
  return postage === null ? null : `${amountFormat.format(postage)} RSD`
}
