import { QueryClient, type QueryKey } from '@tanstack/react-query'
import { planningKeys } from '@/lib/planning/query-keys'
import { broadcastAuthChange, type AuthChange } from '@/lib/auth-broadcast'

/** Lists (work orders, catalog) refetch after 30 s; reference data after 5 min. */
export const LIST_STALE_TIME_MS = 30_000
export const REFERENCE_STALE_TIME_MS = 5 * 60_000

/**
 * The app-wide client data cache. Everything cached is tenant-scoped, so
 * `clearQueryCache()` runs on sign-out, session expiry, impersonation end and
 * sign-in (a different organization may follow in the same tab) — in this tab
 * and, via `broadcastAuthChange`, in the browser's other tabs.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: LIST_STALE_TIME_MS,
      // Hooks surface their own errors/toasts; one retry covers a flaky
      // request without hammering a failing API.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/** Root query keys. Invalidating a root also invalidates every key under it. */
export const queryKeys = {
  workOrders: ['work-orders'] as const,
  workOrderList: (params: object) => ['work-orders', 'list', params] as const,
  workOrderCount: (params: object) => ['work-orders', 'count', params] as const,
  workOrder: (id: string) => ['work-orders', 'detail', id] as const,
  enumValues: ['enum-values'] as const,
  catalogItems: ['catalog-items'] as const,
  catalogItemList: (query: object) => ['catalog-items', 'list', query] as const,
  settings: ['settings'] as const,
}

/** Drops every cached query (tenant-scoped data must not outlive a session). */
export function clearQueryCache(client: QueryClient = queryClient): void {
  client.clear()
}

/**
 * Which cached roots each mutating `window.api` method makes stale. Kept next
 * to the keys so a new mutation has one obvious place to register; the
 * `withQueryInvalidation` wrapper applies it after every successful call, so
 * no call site can forget to invalidate.
 */
const INVALIDATIONS: Partial<Record<keyof Window['api'], readonly QueryKey[]>> = {
  createWorkOrder: [queryKeys.workOrders],
  updateWorkOrder: [queryKeys.workOrders],
  deleteWorkOrder: [queryKeys.workOrders],
  // Saving a process can post stock (catalog items carry on-hand quantities)
  // and change an order's state.
  applyProcessTemplate: [queryKeys.workOrders, queryKeys.catalogItems],
  updateWorkOrderProcess: [queryKeys.workOrders, queryKeys.catalogItems],
  deleteWorkOrderProcess: [queryKeys.workOrders, queryKeys.catalogItems],
  // The list filters and links orders by customer; refetch after a customer
  // change (orders keep their own copy of the client name).
  upsertCustomer: [queryKeys.workOrders],
  deleteCustomer: [queryKeys.workOrders],
  createEnumValue: [queryKeys.enumValues],
  updateEnumValue: [queryKeys.enumValues],
  deleteEnumValue: [queryKeys.enumValues],
  createCatalogItem: [queryKeys.catalogItems],
  updateCatalogItem: [queryKeys.catalogItems],
  deleteCatalogItem: [queryKeys.catalogItems],
  cleanupCatalogItems: [queryKeys.catalogItems],
  postStockReceipt: [queryKeys.catalogItems],
  postStockCount: [queryKeys.catalogItems],
  // Planiranje: resources feed plans and forecasts; publishing feeds queues.
  createMachineType: [planningKeys.machineTypes, planningKeys.machines, planningKeys.planRoot, planningKeys.forecast],
  updateMachineType: [planningKeys.machineTypes, planningKeys.machines, planningKeys.planRoot, planningKeys.forecast],
  deleteMachineType: [planningKeys.machineTypes, planningKeys.machines, planningKeys.planRoot, planningKeys.forecast],
  createMachine: [planningKeys.machines, planningKeys.planRoot, planningKeys.forecast],
  updateMachine: [planningKeys.machines, planningKeys.planRoot, planningKeys.forecast],
  deleteMachine: [planningKeys.machines, planningKeys.planRoot, planningKeys.forecast],
  setQualifications: [planningKeys.qualifications, planningKeys.planRoot, planningKeys.forecast],
  setAttendance: [planningKeys.attendanceRoot, planningKeys.planRoot, planningKeys.forecast],
  setWorkingHours: [
    planningKeys.workingHours,
    planningKeys.planRoot,
    planningKeys.myQueueRoot,
    planningKeys.forecast,
  ],
  generatePlan: [planningKeys.planRoot],
  updatePlanDraft: [planningKeys.planRoot],
  deletePlanDraft: [planningKeys.planRoot],
  publishPlan: [planningKeys.planRoot, planningKeys.myQueueRoot, planningKeys.forecast],
  updateSettings: [queryKeys.settings],
  updateLoginLogo: [queryKeys.settings],
  deleteLoginLogo: [queryKeys.settings],
}

/**
 * Session changes: they clear the cache and tell the other tabs (which share
 * the session cookie) to do the same. Ending an impersonation is a `logout`
 * of the impersonated session; a Backoffice sign-out ends it too.
 */
const CLEARS: Readonly<Record<string, AuthChange>> = {
  login: 'login',
  logout: 'logout',
  platformLogout: 'logout',
  platformImpersonate: 'impersonation-start',
}

function failedLogin(name: string, result: unknown): boolean {
  return (
    name === 'login' &&
    typeof result === 'object' &&
    result !== null &&
    (result as { success?: unknown }).success === false
  )
}

/**
 * Wraps a `window.api` implementation so successful mutations invalidate the
 * cached queries they affect, and session changes clear the cache (here and
 * in the other tabs).
 */
export function withQueryInvalidation(
  api: Window['api'],
  client: QueryClient = queryClient,
): Window['api'] {
  const wrapped = { ...api } as Record<string, unknown>
  for (const [name, method] of Object.entries(api)) {
    if (typeof method !== 'function') continue
    const keys = INVALIDATIONS[name as keyof Window['api']]
    const change = Object.hasOwn(CLEARS, name) ? CLEARS[name] : undefined
    if (!keys && !change) continue
    wrapped[name] = async (...args: unknown[]) => {
      const result = await (method as (...a: unknown[]) => unknown).apply(api, args)
      if (change) {
        clearQueryCache(client)
        if (!failedLogin(name, result)) broadcastAuthChange(change)
      } else {
        for (const queryKey of keys ?? []) {
          void client.invalidateQueries({ queryKey })
        }
      }
      return result
    }
  }
  return wrapped as unknown as Window['api']
}
