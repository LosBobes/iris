import { useCallback, useEffect, useRef, useState } from 'react'
import { reportUnexpectedError } from '@/lib/errors'
import type { StockLevel, StockLevelQuery } from '@/types/stock'

interface UseStockListResult {
  items: StockLevel[]
  total: number
  loading: boolean
  /** True when the last load failed. */
  failed: boolean
  reload: () => Promise<void>
}

/** One page of stock levels through window.api; late responses of older queries are dropped. */
export function useStockList(query: StockLevelQuery): UseStockListResult {
  const [items, setItems] = useState<StockLevel[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const requestId = useRef(0)
  const queryKey = JSON.stringify(query)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await window.api.getStockLevels(JSON.parse(queryKey) as StockLevelQuery)
      if (requestId.current !== id) return
      setItems(result.items)
      setTotal(result.total)
      setFailed(false)
    } catch (cause: unknown) {
      if (requestId.current !== id) return
      reportUnexpectedError('useStockList.load', cause)
      setFailed(true)
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }, [queryKey])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, total, loading, failed, reload }
}
