import { describe, expect, it } from 'vitest'
import {
  formatCatalogPrice,
  formatEffectiveDate,
  kindLabel,
  toCatalogInput,
} from '@/lib/catalog'
import type { CatalogItem } from '@/types/catalog'

describe('formatCatalogPrice', () => {
  it('renders an em dash for a missing price', () => {
    expect(formatCatalogPrice(null)).toBe('—')
  })

  it('formats a numeric price as RSD currency', () => {
    const formatted = formatCatalogPrice(1200)
    expect(formatted).toContain('1.200')
    expect(formatted.toUpperCase()).toContain('RSD')
  })
})

describe('kindLabel', () => {
  it('maps catalog kinds to Serbian labels', () => {
    expect(kindLabel('service')).toBe('Usluga')
    expect(kindLabel('article')).toBe('Artikal')
  })
})

describe('toCatalogInput', () => {
  it('trims fields, defaults the unit, and blanks empty optionals to null', () => {
    const item: CatalogItem = {
      id: 'cat-1',
      code: '  SVC-1 ',
      name: '  Štampa  ',
      kind: 'service',
      unit: '   ',
      purchasePrice: 900,
      salePrice: 1500,
      barcode: '',
      taxGroup: null,
      description: '  ',
      isActive: true,
    }
    expect(toCatalogInput(item)).toEqual({
      code: 'SVC-1',
      name: 'Štampa',
      kind: 'service',
      unit: 'kom',
      purchasePrice: 900,
      salePrice: 1500,
      barcode: null,
      taxGroup: null,
      description: null,
      isActive: true,
    })
  })

  it('passes a provided effective date and omits it otherwise', () => {
    const item: CatalogItem = {
      id: 'cat-2',
      code: 'SVC-2',
      name: 'Štampa',
      kind: 'service',
      unit: 'kom',
      purchasePrice: 100,
      salePrice: 200,
      barcode: null,
      taxGroup: null,
      description: null,
      isActive: true,
    }
    expect(toCatalogInput(item, '2026-08-01').effectiveFrom).toBe('2026-08-01')
    expect(toCatalogInput(item).effectiveFrom).toBeUndefined()
    expect(toCatalogInput(item, null).effectiveFrom).toBeUndefined()
  })
})

describe('formatEffectiveDate', () => {
  it('formats a stored ISO date as DD.MM.YYYY', () => {
    expect(formatEffectiveDate('2026-08-01')).toBe('01.08.2026')
  })

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatEffectiveDate('not-a-date')).toBe('not-a-date')
  })
})
