import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpApi } from './api-client'
import { createFixtureApi } from './fixture-api'
import type {
  CatalogCleanupFilter,
  CatalogCleanupMissing,
  CatalogItem,
  CatalogItemKind,
} from '@/types/catalog'

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// The cleanup filter has two axes, so the tests below walk the full matrix of
// kinds × missing-price modes rather than spot-checking a few combinations.
interface MatrixCase {
  filter: CatalogCleanupFilter
  /** Codes of the seeded items this filter must select, sorted. */
  want: string[]
}

const services: CatalogItemKind[] = ['service']
const articles: CatalogItemKind[] = ['article']
const bothKinds: CatalogItemKind[] = ['service', 'article']

const matrix: MatrixCase[] = [
  { filter: { kinds: services, missing: 'purchase' }, want: ['S-none', 'S-sale-only'] },
  { filter: { kinds: services, missing: 'sale' }, want: ['S-none', 'S-purchase-only'] },
  { filter: { kinds: services, missing: 'both' }, want: ['S-none'] },
  { filter: { kinds: articles, missing: 'purchase' }, want: ['A-none', 'A-sale-only'] },
  { filter: { kinds: articles, missing: 'sale' }, want: ['A-none', 'A-purchase-only'] },
  { filter: { kinds: articles, missing: 'both' }, want: ['A-none'] },
  {
    filter: { kinds: bothKinds, missing: 'purchase' },
    want: ['A-none', 'A-sale-only', 'S-none', 'S-sale-only'],
  },
  {
    filter: { kinds: bothKinds, missing: 'sale' },
    want: ['A-none', 'A-purchase-only', 'S-none', 'S-purchase-only'],
  },
  { filter: { kinds: bothKinds, missing: 'both' }, want: ['A-none', 'S-none'] },
]

function caseName(filter: CatalogCleanupFilter): string {
  return `${filter.kinds.join('+')} missing ${filter.missing}`
}

describe('catalog cleanup HTTP encoding', () => {
  const emptyResult = { items: [], total: 0 }

  it.each(matrix.map(({ filter }) => [caseName(filter), filter] as const))(
    'encodes %s as repeated kind params plus missing',
    async (_name, filter) => {
      const fetchMock = vi.fn().mockResolvedValue(response(emptyResult))
      const api = createHttpApi('http://api.test', fetchMock)

      await api.previewCatalogCleanup(filter)

      const [requestUrl, init] = fetchMock.mock.calls[0]
      const url = new URL(requestUrl as string)
      expect(url.pathname).toBe('/catalog-items/cleanup')
      expect(url.searchParams.getAll('kind')).toEqual(filter.kinds)
      expect(url.searchParams.get('missing')).toBe(filter.missing)
      expect((init as RequestInit).method ?? 'GET').toBe('GET')
      expect((init as RequestInit).credentials).toBe('include')
    },
  )

  it('sends the delete to the same URL the preview used, as a POST', async () => {
    const filter: CatalogCleanupFilter = { kinds: bothKinds, missing: 'sale' }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyResult))
      .mockResolvedValueOnce(response({ deleted: 0 }))
    const api = createHttpApi('http://api.test', fetchMock)

    await api.previewCatalogCleanup(filter)
    await api.cleanupCatalogItems(filter)

    const [previewUrl] = fetchMock.mock.calls[0]
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1]
    // Identical query strings: what the admin saw is what gets deleted.
    expect(deleteUrl).toBe(previewUrl)
    expect((deleteInit as RequestInit).method).toBe('POST')
    expect((deleteInit as RequestInit).credentials).toBe('include')
  })

  it('returns the deleted count from the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ deleted: 7 }))
    const api = createHttpApi('http://api.test', fetchMock)

    await expect(
      api.cleanupCatalogItems({ kinds: services, missing: 'both' }),
    ).resolves.toEqual({ deleted: 7 })
  })

  it('surfaces a rejected filter as an error instead of reporting success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ error: 'Neispravna vrsta stavke.' }, { status: 400 }))
    const api = createHttpApi('http://api.test', fetchMock)

    await expect(
      api.cleanupCatalogItems({ kinds: [], missing: 'both' }),
    ).rejects.toThrow('Neispravna vrsta stavke.')
  })

  it('tolerates a null items array in the preview response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ items: null, total: 0 }))
    const api = createHttpApi('http://api.test', fetchMock)

    await expect(
      api.previewCatalogCleanup({ kinds: services, missing: 'both' }),
    ).resolves.toEqual({ items: [], total: 0 })
  })
})

// The fixture API is the dev-mode data source; it has to agree with the server
// on exactly which items a filter selects, or fixtures mode would mislead.
describe('catalog cleanup against the fixture API', () => {
  type FixtureApi = ReturnType<typeof createFixtureApi>

  const seeds: { code: string; kind: CatalogItemKind; purchase: number | null; sale: number | null }[] = [
    { code: 'S-none', kind: 'service', purchase: null, sale: null },
    { code: 'S-purchase-only', kind: 'service', purchase: 400, sale: null },
    { code: 'S-sale-only', kind: 'service', purchase: null, sale: 1400 },
    { code: 'S-both', kind: 'service', purchase: 400, sale: 1400 },
    { code: 'A-none', kind: 'article', purchase: null, sale: null },
    { code: 'A-purchase-only', kind: 'article', purchase: 100, sale: null },
    { code: 'A-sale-only', kind: 'article', purchase: null, sale: 250 },
    { code: 'A-both', kind: 'article', purchase: 100, sale: 250 },
  ]

  let api: FixtureApi

  async function catalogCodes(): Promise<string[]> {
    const { items } = await api.getCatalogItems()
    return items.map((item: CatalogItem) => item.code).sort()
  }

  beforeEach(async () => {
    api = createFixtureApi()
    // The fixture catalog is module state shared across instances: clear it so
    // the matrix below is the whole world.
    const existing = await api.getCatalogItems()
    for (const item of existing.items) {
      await api.deleteCatalogItem(item.id)
    }
    for (const seed of seeds) {
      await api.createCatalogItem({
        code: seed.code,
        name: `Stavka ${seed.code}`,
        kind: seed.kind,
        unit: 'kom',
        purchasePrice: seed.purchase,
        salePrice: seed.sale,
        barcode: null,
        taxGroup: null,
        description: null,
        isActive: true,
      })
    }
  })

  it.each(matrix.map(({ filter, want }) => [caseName(filter), filter, want] as const))(
    'previews and deletes exactly the items for %s',
    async (_name, filter, want) => {
      const preview = await api.previewCatalogCleanup(filter)
      expect(preview.items.map((item: CatalogItem) => item.code).sort()).toEqual(want)
      expect(preview.total).toBe(want.length)

      const { deleted } = await api.cleanupCatalogItems(filter)
      expect(deleted).toBe(want.length)

      const remaining = seeds
        .map((seed) => seed.code)
        .filter((code) => !want.includes(code))
        .sort()
      expect(await catalogCodes()).toEqual(remaining)

      // Repeating the same cleanup is a no-op.
      expect((await api.cleanupCatalogItems(filter)).deleted).toBe(0)
    },
  )

  it('deletes nothing when no kind is selected', async () => {
    const before = await catalogCodes()
    for (const missing of ['purchase', 'sale', 'both'] as CatalogCleanupMissing[]) {
      const preview = await api.previewCatalogCleanup({ kinds: [], missing })
      expect(preview.items).toEqual([])
      expect((await api.cleanupCatalogItems({ kinds: [], missing })).deleted).toBe(0)
    }
    expect(await catalogCodes()).toEqual(before)
  })

  it('leaves the catalog untouched when only previewing', async () => {
    const before = await catalogCodes()
    await api.previewCatalogCleanup({ kinds: bothKinds, missing: 'purchase' })
    await api.previewCatalogCleanup({ kinds: bothKinds, missing: 'sale' })
    expect(await catalogCodes()).toEqual(before)
  })

  it('never deletes an item that has the price being filtered on', async () => {
    await api.cleanupCatalogItems({ kinds: bothKinds, missing: 'purchase' })
    const { items } = await api.getCatalogItems()
    for (const item of items) {
      expect(item.purchasePrice).not.toBeNull()
    }
  })
})
