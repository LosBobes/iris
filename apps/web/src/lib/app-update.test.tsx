// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAvailableUpdate } from './app-update'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAvailableUpdate', () => {
  it('reports a newer deployed version', async () => {
    const fetchVersion = vi.fn().mockResolvedValue('2.23.0')
    const { result } = renderHook(() =>
      useAvailableUpdate({ enabled: true, currentVersion: '2.22.0', fetchVersion }),
    )
    await waitFor(() => expect(result.current).toBe('2.23.0'))
  })

  it('stays quiet on the same version, an unreadable file, or a dev build', async () => {
    for (const [current, deployed] of [
      ['2.22.0', '2.22.0'],
      ['2.22.0', null],
      ['dev', '2.23.0'],
    ] as const) {
      const fetchVersion = vi.fn().mockResolvedValue(deployed)
      const { result, unmount } = renderHook(() =>
        useAvailableUpdate({ enabled: true, currentVersion: current, fetchVersion }),
      )
      await waitFor(() => expect(fetchVersion).toHaveBeenCalled())
      expect(result.current).toBeNull()
      unmount()
    }
  })

  it('does not check when disabled', () => {
    const fetchVersion = vi.fn()
    renderHook(() => useAvailableUpdate({ enabled: false, fetchVersion }))
    expect(fetchVersion).not.toHaveBeenCalled()
  })

  it('re-checks on the interval and on focus, throttled', async () => {
    vi.useFakeTimers()
    const fetchVersion = vi.fn().mockResolvedValue('2.22.0')
    renderHook(() =>
      useAvailableUpdate({
        enabled: true,
        currentVersion: '2.22.0',
        fetchVersion,
        intervalMs: 300_000,
        minGapMs: 60_000,
      }),
    )
    expect(fetchVersion).toHaveBeenCalledTimes(1)

    // Focus right after the first check is throttled.
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(fetchVersion).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(fetchVersion).toHaveBeenCalledTimes(2)

    await act(async () => {
      vi.advanceTimersByTime(300_000)
    })
    expect(fetchVersion).toHaveBeenCalledTimes(3)
  })
})
