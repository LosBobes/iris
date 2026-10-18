// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from './useCountUp'

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubReducedMotion(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('counts up from zero to the target and settles on it', () => {
    const { result } = renderHook(() => useCountUp(100, 500))
    expect(result.current).toBe(0)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(100)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(100)
  })

  it('does not restart when re-rendered with the same target', () => {
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 300), { initialProps: { n: 40 } })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(40)
    rerender({ n: 40 })
    expect(result.current).toBe(40)
  })

  it('tweens from the shown value when the target changes', () => {
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 300), { initialProps: { n: 10 } })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender({ n: 50 })
    expect(result.current).toBe(10)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(50)
  })

  it('returns the final value immediately under reduced motion', () => {
    stubReducedMotion(true)
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 500), { initialProps: { n: 75 } })
    expect(result.current).toBe(75)
    rerender({ n: 90 })
    expect(result.current).toBe(90)
  })
})
