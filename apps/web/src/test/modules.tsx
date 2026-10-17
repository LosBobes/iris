import { useContext } from 'react'
import { OrganizationContext } from '@/contexts/OrganizationContext'
import type { OrganizationModules } from '@/types/settings'

/** Both optional modules on (processes requires stock). */
export const ALL_MODULES: OrganizationModules = { processes: true, stock: true }
/** Only the Magacin module on. */
export const STOCK_ONLY: OrganizationModules = { processes: false, stock: true }
/** Fresh-organization default. */
export const NO_MODULES: OrganizationModules = { processes: false, stock: false }

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
