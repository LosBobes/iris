// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { broadcastAuthChange, subscribeAuthChange } from '@/lib/auth-broadcast'
import { createTestQueryClient } from '@/test/query'
import { queryKeys, withQueryInvalidation } from '@/lib/query-client'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('auth broadcast', () => {
  it('reaches other tabs over BroadcastChannel, never the sending tab', async () => {
    if (typeof BroadcastChannel !== 'function') return
    const listener = vi.fn()
    const unsubscribe = subscribeAuthChange(listener)

    // Another tab's message carries a different tab id.
    const otherTab = new BroadcastChannel('iris-auth')
    otherTab.postMessage({ change: 'logout', at: 1, tab: 'other-tab' })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('logout'))
    otherTab.close()

    // This tab's own sign-in must not make it drop its cache and re-check
    // the session it just started (a loading flash, and in fixture mode a
    // sign-out).
    broadcastAuthChange('login')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('falls back to storage events without BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const listener = vi.fn()
    const unsubscribe = subscribeAuthChange(listener)

    broadcastAuthChange('login')
    expect(setItem).toHaveBeenCalledWith('iris-auth-change', expect.stringContaining('"login"'))

    // The storage event fires only in the other tabs; simulate one arriving.
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'iris-auth-change',
        newValue: JSON.stringify({ change: 'impersonation-start', at: 1 }),
      }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '{}' }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('impersonation-start')
    unsubscribe()
  })

  it('is sent by session-changing api calls, but not by a failed login', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const client = createTestQueryClient()
    const api = withQueryInvalidation(
      {
        login: vi.fn(async () => ({ success: false, error: 'x' })),
        logout: vi.fn(async () => undefined),
        platformImpersonate: vi.fn(async () => ({ success: true })),
      } as unknown as Window['api'],
      client,
    )

    client.setQueryData(queryKeys.settings, { firmName: 'A' })
    await api.login({ orgSlug: 'demo', username: 'a', password: 'b' } as never)
    expect(client.getQueryData(queryKeys.settings)).toBeUndefined()
    expect(setItem).not.toHaveBeenCalled()

    await api.logout()
    await api.platformImpersonate('demo', 'u-1')
    const sent = setItem.mock.calls.map(([, value]) => JSON.parse(value as string).change)
    expect(sent).toEqual(['logout', 'impersonation-start'])
  })
})
