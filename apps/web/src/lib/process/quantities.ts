import type { WorkOrderProcess } from '@/types/process'

// Item-node quantities are per unit of the order (D-028). Everything on the
// client that turns a planned quantity into an amount for an order goes through
// these helpers, so the multiplication happens exactly once and rounds the same
// way as the server (three decimals).

/** Rounds a quantity to three decimals, like the server. */
export function roundPlanned(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * The factor a per-unit planned quantity is multiplied by for an order: the
 * order's `jobDetails.quantity` (at least 1), or 1 for a process copy flagged
 * `quantitiesPerOrder` (copies made before D-028 store absolute amounts).
 */
export function plannedQuantityFactor(
  orderQuantity: number | null | undefined,
  quantitiesPerOrder = false,
): number {
  if (quantitiesPerOrder) return 1
  if (orderQuantity === null || orderQuantity === undefined || !Number.isFinite(orderQuantity)) return 1
  const whole = Math.floor(orderQuantity)
  return whole < 1 ? 1 : whole
}

/** `plannedQuantityFactor` for a loaded process copy (null/undefined = per unit). */
export function processQuantityFactor(
  process: Pick<WorkOrderProcess, 'quantitiesPerOrder'> | null | undefined,
  orderQuantity: number | null | undefined,
): number {
  return plannedQuantityFactor(orderQuantity, Boolean(process?.quantitiesPerOrder))
}

/** Per-unit quantity × factor, rounded; undefined stays undefined (no plan). */
export function scalePlannedQuantity(value: number | undefined, factor: number): number | undefined {
  if (value === undefined) return undefined
  return roundPlanned(value * factor)
}
