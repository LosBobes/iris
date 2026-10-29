import { describe, expect, it } from 'vitest'
import type { Shipping } from '@/types/work-order'
import { makeWorkOrder } from '@/test/work-order-factory'
import { formatParcelSummary, formatPostageSummary, getPrintParcels } from './parcels'

const shipping = (overrides: Partial<Shipping>): Shipping => ({
  ...makeWorkOrder().shipping,
  ...overrides,
})

describe('getPrintParcels', () => {
  it('prints nothing without packages or postage', () => {
    expect(getPrintParcels(shipping({}))).toBeNull()
  })

  it('lists each package weight and totals them once all are weighed', () => {
    expect(
      getPrintParcels(shipping({ packages: [{ weightKg: 1250.5 }, { weightKg: 2 }], estimatedPostage: 1650 })),
    ).toEqual({
      count: 2,
      weights: ['1.250,5', '2'],
      compact: false,
      totalWeight: '1.252,5',
      postage: '1.650',
    })
  })

  it('marks unweighed packages and withholds the total', () => {
    const parcels = getPrintParcels(shipping({ packages: [{ weightKg: 2.5 }, { weightKg: null }] }))
    expect(parcels?.weights).toEqual(['2,5', '?'])
    expect(parcels?.totalWeight).toBeNull()
    expect(parcels?.postage).toBeNull()
  })

  it('switches to one wrapped line for many packages', () => {
    const packages = Array.from({ length: 9 }, () => ({ weightKg: 1 }))
    expect(getPrintParcels(shipping({ packages }))?.compact).toBe(true)
  })

  it('prints the postage alone', () => {
    expect(getPrintParcels(shipping({ estimatedPostage: 650 }))).toMatchObject({ count: 0, postage: '650' })
  })
})

describe('detail summaries', () => {
  it('summarizes packages and postage', () => {
    const value = shipping({ packages: [{ weightKg: 1.5 }, { weightKg: null }], estimatedPostage: 720 })
    expect(formatParcelSummary(value)).toBe('2 kom (1,5 kg; ? kg)')
    expect(formatPostageSummary(value)).toBe('720 RSD')
    expect(formatParcelSummary(shipping({}))).toBeNull()
  })
})
