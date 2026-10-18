import { QueryClient, type QueryKey } from '@tanstack/react-query'

/** Lists (work orders, catalog) refetch after 30 s; reference data after 5 min. */
export const LIST_STALE_TIME_MS = 30_000
export const REFERENCE_STALE_TIME_MS = 5 * 60_000

/**
 * The app-wide client data cache. Everything cached is tenant-scoped, so
 * `clearQueryCache()` runs on sign-out, session expiry, impersonation end and
 * sign-in (a different organization may follow in the same tab).
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
  // Saving a process can post stock and change an order's state.
  applyProcessTemplate: [queryKeys.workOrders],
  updateWorkOrderProcess: [queryKeys.workOrders],
  deleteWorkOrderProcess: [queryKeys.workOrders],
  // Customer renames are copied onto orders server-side.
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
  updateSettings: [queryKeys.settings],
  updateLoginLogo: [queryKeys.settings],
  deleteLoginLogo: [queryKeys.settings],
}

const CLEARS: ReadonlySet<string> = new Set(['logout', 'login', 'platformLogout', 'platformImpersonate'])

/**
 * Wraps a `window.api` implementation so successful mutations invalidate the
 * cached queries they affect, and session changes clear the cache.
 */
export function withQueryInvalidation(
  api: Window['api'],
  client: QueryClient = queryClient,
): Window['api'] {
  const wrapped = { ...api } as Record<string, unknown>
  for (const [name, method] of Object.entries(api)) {
    if (typeof method !== 'function') continue
    const keys = INVALIDATIONS[name as keyof Window['api']]
    const clears = CLEARS.has(name)
    if (!keys && !clears) continue
    wrapped[name] = async (...args: unknown[]) => {
      const result = await (method as (...a: unknown[]) => unknown).apply(api, args)
      if (clears) {
        clearQueryCache(client)
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
