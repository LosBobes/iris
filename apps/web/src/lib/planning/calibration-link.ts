import { MAX_TRANSFER_MINUTES } from '@/types/planning'

// The calibration card (D-028) opens the working-hours tab of the resources
// page with the recommended transfer time prefilled; nothing is saved until
// the admin presses "Sačuvaj".

const TRANSFER_PARAM = 'transferMinutes'

/** The resources page's working-hours tab, prefilled with a transfer time. */
export function workingHoursLink(transferMinutes: number): string {
  return `/planning/resources?${new URLSearchParams({ tab: 'hours', [TRANSFER_PARAM]: String(transferMinutes) })}`
}

/** The prefilled transfer time from the page's search params, or null when absent or out of range. */
export function suggestedTransferMinutes(params: URLSearchParams): number | null {
  const raw = params.get(TRANSFER_PARAM)
  if (raw === null || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return value <= MAX_TRANSFER_MINUTES ? value : null
}
