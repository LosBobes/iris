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
  it('reaches other subscribers over BroadcastChannel', async () => {
    if (typeof BroadcastChannel !== 'function') return
    const listener = vi.fn()
    const unsubscribe = subscribeAuthChange(listener)
    broadcastAuthChange('logout')
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('logout'))
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
