import { useCallback, useEffect, useRef, useState } from 'react'
import { reportUnexpectedError } from '@/lib/errors'
import { fetchAllStockLevels } from '@/lib/stock/api'
import { toLevelMap, type StockLevelMap } from '@/lib/stock/posting'

interface UseStockLevelsResult {
  /** Levels by catalog item id; only articles that exist in the warehouse list. */
  levels: StockLevelMap
  /** True once a fetch finished (successfully or not). */
  loaded: boolean
  /** Forces a refetch (e.g. after the stock changed by saving a process). */
  reload: () => void
}

/**
 * Stock levels for the given linked articles, fetched once and refetched only
 * when a not-yet-covered article id appears or `reload` is called. With no ids
 * (or `enabled` false) nothing is requested, so unlinked graphs cost no call.
 */
export function useStockLevels(catalogItemIds: readonly string[], enabled = true): UseStockLevelsResult {
  const [levels, setLevels] = useState<StockLevelMap>({})
  const [loaded, setLoaded] = useState(false)
  const [token, setToken] = useState(0)
  const covered = useRef<{ ids: Set<string>; token: number }>({ ids: new Set(), token: 0 })
  const idsKey = [...new Set(catalogItemIds)].sort().join('|')

  useEffect(() => {
    if (!enabled || idsKey === '') return
    const wanted = idsKey.split('|')
    const state = covered.current
    if (state.token === token && wanted.every((id) => state.ids.has(id))) return
    let active = true
    // Marked as covered only once the request settled, so an effect re-run
    // (StrictMode, fast id changes) never skips a request that was abandoned.
    const markCovered = (): void => {
      covered.current = { ids: new Set([...(state.token === token ? state.ids : []), ...wanted]), token }
    }
    fetchAllStockLevels()
      .then((list) => {
        if (!active) return
        markCovered()
        setLevels(toLevelMap(list))
        setLoaded(true)
      })
      .catch((cause: unknown) => {
        if (!active) return
        reportUnexpectedError('useStockLevels.load', cause)
        markCovered()
        setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [idsKey, enabled, token])

  const reload = useCallback(() => setToken((current) => current + 1), [])

  return { levels, loaded, reload }
}
