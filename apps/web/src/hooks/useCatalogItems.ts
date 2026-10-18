import { useCallback, useEffect } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CatalogItem, CatalogItemQuery } from '@/types/catalog'
import i18n from '@/i18n'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'

interface UseCatalogItemsResult {
  items: CatalogItem[]
  total: number
  loading: boolean
  reload: () => Promise<void>
}

const EMPTY: CatalogItem[] = []

/**
 * Loads a page of catalog items through window.api, optionally filtered. The
 * query (kind/q/limit/offset) drives server-side filtering and pagination; the
 * returned total reflects all matches, not just the current page. Results are
 * cached per query and refreshed after any catalog mutation.
 */
export function useCatalogItems(query: CatalogItemQuery = {}): UseCatalogItemsResult {
  const queryClient = useQueryClient()
  // Serialize the query so a re-render with an equal object reuses the cache.
  const serialized = JSON.stringify(query)
  const result = useQuery({
    queryKey: queryKeys.catalogItemList(JSON.parse(serialized) as CatalogItemQuery),
    queryFn: () => window.api.getCatalogItems(JSON.parse(serialized) as CatalogItemQuery),
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (!result.error) return
    reportUnexpectedError('useCatalogItems.load', result.error)
    toast.error(formatActionError(i18n.t('common.loadCatalogError'), result.error))
  }, [result.error])

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.catalogItems })
  }, [queryClient])

  return {
    items: result.data?.items ?? EMPTY,
    total: result.data?.total ?? 0,
    loading: result.isFetching,
    reload,
  }
}
