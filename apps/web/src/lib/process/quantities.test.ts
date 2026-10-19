import { describe, expect, it } from 'vitest'
import { plannedQuantityFactor, processQuantityFactor, scalePlannedQuantity } from './quantities'

describe('planned quantity factor (D-028)', () => {
  it('is the order quantity for a per-unit copy, at least 1', () => {
    expect(plannedQuantityFactor(3)).toBe(3)
    expect(plannedQuantityFactor(0)).toBe(1)
    expect(plannedQuantityFactor(null)).toBe(1)
    expect(plannedQuantityFactor(undefined)).toBe(1)
    expect(plannedQuantityFactor(Number.NaN)).toBe(1)
    expect(plannedQuantityFactor(2.9)).toBe(2)
  })

  it('is 1 for a legacy copy flagged quantitiesPerOrder', () => {
    expect(plannedQuantityFactor(3, true)).toBe(1)
    expect(processQuantityFactor({ quantitiesPerOrder: true }, 3)).toBe(1)
    expect(processQuantityFactor({ quantitiesPerOrder: false }, 3)).toBe(3)
    expect(processQuantityFactor(null, 3)).toBe(3)
  })

  it('scales per-unit quantities once, rounded to three decimals', () => {
    expect(scalePlannedQuantity(0.13, 5000)).toBe(650)
    expect(scalePlannedQuantity(1100 / 3000, 3000)).toBe(1100)
    expect(scalePlannedQuantity(undefined, 3)).toBeUndefined()
  })
})
