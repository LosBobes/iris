// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearReturnLocation,
  isRestorableLocation,
  notifySessionExpired,
  rememberReturnLocation,
  subscribeSessionExpired,
  takeReturnLocation,
} from './session'

function goTo(path: string): void {
  window.history.replaceState({}, '', path)
}

describe('return location', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    goTo('/')
  })

  it('brings the operator back to the work order they were on', () => {
    goTo('/work-orders/179')
    notifySessionExpired()

    expect(takeReturnLocation()).toBe('/work-orders/179')
  })

  it('keeps the page the session actually lapsed on', () => {
    // A lapsed session fails every request the page has in flight, so this
    // fires several times; the first one is the page the operator was looking
    // at, and later ones must not overwrite it.
    goTo('/work-orders/179/edit')
    notifySessionExpired()
    notifySessionExpired()

    expect(takeReturnLocation()).toBe('/work-orders/179/edit')
  })

  it('preserves query and hash', () => {
    goTo('/work-orders?status=new#list')
    notifySessionExpired()

    expect(takeReturnLocation()).toBe('/work-orders?status=new#list')
  })

  it('reads the location once and then forgets it', () => {
    goTo('/customers/cust-1')
    notifySessionExpired()

    expect(takeReturnLocation()).toBe('/customers/cust-1')
    expect(takeReturnLocation()).toBeNull()
  })

  it('does not remember the root, which is where a login lands anyway', () => {
    goTo('/')
    notifySessionExpired()

    expect(takeReturnLocation()).toBeNull()
  })

  it('refuses a location that is not a plain in-app path', () => {
    // A stored value is fed straight to the router after a login, so a
    // protocol-relative path must never be treated as somewhere to go.
    expect(isRestorableLocation('//evil.example/phish')).toBe(false)
    expect(isRestorableLocation('https://evil.example')).toBe(false)
    expect(isRestorableLocation('/work-orders/179')).toBe(true)
  })

  it('drops the remembered page on a deliberate sign-out', () => {
    goTo('/work-orders/179')
    rememberReturnLocation()
    clearReturnLocation()

    expect(takeReturnLocation()).toBeNull()
  })
})

describe('session expiry listeners', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    goTo('/work-orders/179')
  })

  it('notifies every subscriber and stops after unsubscribe', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeSessionExpired(first)
    const unsubscribeSecond = subscribeSessionExpired(second)

    notifySessionExpired()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    notifySessionExpired()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)

    unsubscribeSecond()
  })

  it('keeps one failing listener from silencing the others', () => {
    const throwing = vi.fn(() => {
      throw new Error('listener blew up')
    })
    const healthy = vi.fn()
    const unsubscribeThrowing = subscribeSessionExpired(throwing)
    const unsubscribeHealthy = subscribeSessionExpired(healthy)

    // The caller is an API client about to throw its own error; a listener
    // must not replace it.
    expect(() => notifySessionExpired()).not.toThrow()
    expect(healthy).toHaveBeenCalledTimes(1)

    unsubscribeThrowing()
    unsubscribeHealthy()
  })
})
