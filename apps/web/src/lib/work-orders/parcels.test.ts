import { describe, expect, it } from 'vitest'
import type { Shipping } from '@/types/work-order'
import { makeWorkOrder } from '@/test/work-order-factory'
import { formatParcelSummary, formatPostageSummary, getPrintParcels } from './parcels'

const shipping = (overrides: Partial<Shipping>): Shipping => ({
  ...makeWorkOrder().shipping,
  ...overrides,
})

const BLANK = '______'

describe('getPrintParcels', () => {
  it('prints no box for pickup or no delivery method without data', () => {
    expect(getPrintParcels(shipping({ deliveryMethod: null }))).toBeNull()
    expect(getPrintParcels(shipping({ deliveryMethod: 'pickup' }))).toBeNull()
  })

  it('prints blank lines to fill in by pen for a sent order with nothing entered', () => {
    expect(getPrintParcels(shipping({ deliveryMethod: 'postExpress' }))).toEqual({
      count: BLANK,
      weights: [BLANK, BLANK, BLANK, BLANK, BLANK],
      compact: false,
      totalWeight: null,
      postage: BLANK,
      blank: true,
    })
  })

  it('lists each package weight and totals them once all are weighed', () => {
    expect(
      getPrintParcels(
        shipping({
          deliveryMethod: 'postExpress',
          packages: [{ weightKg: 1250.5 }, { weightKg: 2 }],
          estimatedPostage: 1650,
        }),
      ),
    ).toEqual({
      count: '2',
      weights: ['1.250,5', '2'],
      compact: false,
      totalWeight: '1.252,5',
      postage: '1.650',
      blank: false,
    })
  })

  it('leaves a blank line for unweighed packages and withholds the total', () => {
    const parcels = getPrintParcels(
      shipping({ deliveryMethod: 'cityExpress', packages: [{ weightKg: 2.5 }, { weightKg: null }] }),
    )
    expect(parcels?.weights).toEqual(['2,5', BLANK])
    expect(parcels?.totalWeight).toBeNull()
    expect(parcels?.postage).toBe(BLANK)
  })

  it('switches to one wrapped line for many packages', () => {
    const packages = Array.from({ length: 9 }, () => ({ weightKg: 1 }))
    expect(getPrintParcels(shipping({ deliveryMethod: 'postExpress', packages }))?.compact).toBe(true)
  })

  it('still prints entered data on an order that is not sent', () => {
    expect(getPrintParcels(shipping({ deliveryMethod: 'pickup', estimatedPostage: 650 }))).toMatchObject({
      count: BLANK,
      postage: '650',
    })
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
