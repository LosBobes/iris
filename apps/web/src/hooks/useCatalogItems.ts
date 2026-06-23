import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { CatalogItem, CatalogItemQuery } from '@/types/catalog'

interface UseCatalogItemsResult {
  items: CatalogItem[]
  total: number
  loading: boolean
  reload: () => Promise<void>
}

/**
 * Loads a page of catalog items through window.api, optionally filtered. The
 * query (kind/q/limit/offset) drives server-side filtering and pagination; the
 * returned total reflects all matches, not just the current page.
 */
export function useCatalogItems(query: CatalogItemQuery = {}): UseCatalogItemsResult {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // Serialize the query so the effect only re-runs when a filter actually changes.
  const queryKey = JSON.stringify(query)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.getCatalogItems(JSON.parse(queryKey) as CatalogItemQuery)
      setItems(result.items)
      setTotal(result.total)
    } catch {
      toast.error('Greška pri učitavanju kataloga.')
    } finally {
      setLoading(false)
    }
  }, [queryKey])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, total, loading, reload }
}
