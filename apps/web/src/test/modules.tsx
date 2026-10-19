import { useContext } from 'react'
import { OrganizationContext } from '@/contexts/OrganizationContext'
import type { OrganizationModules } from '@/types/settings'

/** Magacin and Procesi rada on, Planiranje and Prisustvo off (processes requires stock). */
export const ALL_MODULES: OrganizationModules = { processes: true, stock: true, planning: false, attendance: false }
/** Every module on (planning requires processes and attendance). */
export const PLANNING_MODULES: OrganizationModules = { processes: true, stock: true, planning: true, attendance: true }
/** Only the Magacin module on. */
export const STOCK_ONLY: OrganizationModules = { processes: false, stock: true, planning: false, attendance: false }
/** Only the Prisustvo module on (it has no requirements). */
export const ATTENDANCE_ONLY: OrganizationModules = { processes: false, stock: false, planning: false, attendance: true }
/** Fresh-organization default. */
export const NO_MODULES: OrganizationModules = { processes: false, stock: false, planning: false, attendance: false }

/**
 * Test wrapper that provides the organization context with the given modules
 * (everything else keeps the context defaults). Usage:
 * `render(<WithModules modules={ALL_MODULES}>{ui}</WithModules>)`.
 */
export function WithModules({
  modules,
  children,
}: {
  modules: OrganizationModules
  children: React.ReactNode
}): React.JSX.Element {
  const base = useContext(OrganizationContext)
  return <OrganizationContext value={{ ...base, modules }}>{children}</OrganizationContext>
}
