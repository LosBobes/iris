import type { Shipping } from '@/types/work-order'

// The packages an order is sent in, as printed in the "PAKETI" box and shown on
// the detail page. TypeScript twin of ResolvePrintParcels in
// iris-api/internal/reports/work_order_pdf.go — keep them in step.
export interface PrintParcels {
  count: number
  /** Per package, "?" until weighed. */
  weights: string[]
  /** Many packages: the weights print as one wrapped line. */
  compact: boolean
  /** Null until every package is weighed. */
  totalWeight: string | null
  /** Null when the postage is not estimated. */
  postage: string | null
}

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

export function getPrintParcels(shipping: Shipping): PrintParcels | null {
  const packages = shipping.packages ?? []
  const postage = shipping.estimatedPostage ?? null
  if (packages.length === 0 && postage === null) return null

  let total = 0
  let allWeighed = packages.length > 0
  const weights = packages.map((pkg) => {
    if (pkg.weightKg === null) {
      allWeighed = false
      return '?'
    }
    total += pkg.weightKg
    return quantityFormat.format(pkg.weightKg)
  })

  return {
    count: packages.length,
    weights,
    compact: packages.length >= PRINT_PARCELS_COMPACT_FROM,
    totalWeight: allWeighed ? quantityFormat.format(total) : null,
    postage: postage === null ? null : amountFormat.format(postage),
  }
}

/** One-line summary for the detail page, e.g. "2 kom (1,5 kg; ? kg)". */
export function formatParcelSummary(shipping: Shipping): string | null {
  const parcels = getPrintParcels(shipping)
  if (!parcels || parcels.count === 0) return null
  return `${parcels.count} kom (${parcels.weights.map((w) => `${w} kg`).join('; ')})`
}

/** The estimated postage for the detail page, e.g. "650 RSD". */
export function formatPostageSummary(shipping: Shipping): string | null {
  const postage = shipping.estimatedPostage ?? null
  return postage === null ? null : `${amountFormat.format(postage)} RSD`
}
