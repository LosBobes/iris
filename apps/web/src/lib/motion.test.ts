import { describe, expect, it } from 'vitest'
import { hasNewItems, percentToScale, staggerIndex, staggerStyle } from './motion'

describe('motion helpers', () => {
  it('staggers only the first items', () => {
    expect(staggerIndex(0)).toBe(0)
    expect(staggerIndex(5)).toBe(5)
    expect(staggerIndex(11)).toBe(11)
    expect(staggerIndex(12)).toBe(0)
    expect(staggerIndex(40, 3)).toBe(0)
    expect(staggerIndex(-1)).toBe(0)
  })

  it('exposes the stagger index as a CSS custom property', () => {
    expect((staggerStyle(4) as Record<string, unknown>)['--iris-stagger-index']).toBe(4)
  })

  it('detects newly appearing items only', () => {
    expect(hasNewItems([], ['a'])).toBe(true)
    expect(hasNewItems(['a'], ['a'])).toBe(false)
    expect(hasNewItems(['a', 'b'], ['b'])).toBe(false)
    expect(hasNewItems(['a'], ['a', 'c'])).toBe(true)
    expect(hasNewItems(['a'], [])).toBe(false)
  })

  it('clamps percent to a scale factor', () => {
    expect(percentToScale(50)).toBe(0.5)
    expect(percentToScale(-5)).toBe(0)
    expect(percentToScale(140)).toBe(1)
    expect(percentToScale(Number.NaN)).toBe(0)
  })
})
