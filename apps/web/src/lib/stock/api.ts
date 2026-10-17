import type { StockLevel } from '@/types/stock'

const PAGE_SIZE = 200
const MAX_PAGES = 50

/**
 * Loads every stock level page by page through window.api (the contract only
 * filters by search/lowOnly, so id lookups and the stocktake read the full list).
 */
export async function fetchAllStockLevels(search?: string): Promise<StockLevel[]> {
  const all: StockLevel[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await window.api.getStockLevels({ search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
    all.push(...result.items)
    if (result.items.length < PAGE_SIZE || all.length >= result.total) break
  }
  return all
}
