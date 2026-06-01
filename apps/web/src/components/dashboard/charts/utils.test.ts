import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatRevenueAxisTick,
  get12MonthsEndingAt,
  getLast12Months,
  resolveChartMonths,
} from './utils'

describe('resolveChartMonths', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns rolling last 12 months when there is no data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))

    expect(resolveChartMonths([])).toEqual(getLast12Months())
  })

  it('returns rolling window when data overlaps it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))

    const rolling = getLast12Months()
    expect(resolveChartMonths(['2026-01', '2026-04'])).toEqual(rolling)
  })

  it('anchors on latest data month when all data is older than rolling window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))

    expect(resolveChartMonths(['2024-11', '2025-03'])).toEqual(
      get12MonthsEndingAt('2025-03'),
    )
  })
})

describe('get12MonthsEndingAt', () => {
  it('returns twelve months ending at the given month', () => {
    expect(get12MonthsEndingAt('2025-03')).toEqual([
      '2024-04',
      '2024-05',
      '2024-06',
      '2024-07',
      '2024-08',
      '2024-09',
      '2024-10',
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
      '2025-03',
    ])
  })
})

describe('formatRevenueAxisTick', () => {
  it('formats zero and sub-thousand values without a k suffix', () => {
    expect(formatRevenueAxisTick(0)).toBe('0')
    expect(formatRevenueAxisTick(850)).toBe('850')
  })

  it('formats thousands with a k suffix', () => {
    expect(formatRevenueAxisTick(145000)).toBe('145k')
  })
})
