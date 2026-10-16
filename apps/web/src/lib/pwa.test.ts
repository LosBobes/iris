import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPwaInstallState,
  initPwaInstallListeners,
  isIosDevice,
  promptInstall,
  resetPwaInstallStateForTests,
  subscribePwaInstall,
} from './pwa'

function stubBrowser({
  userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0',
  platform = 'Linux armv8l',
  maxTouchPoints = 5,
  standalone = false,
}: {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  standalone?: boolean
} = {}): EventTarget {
  const win = new EventTarget() as EventTarget & Partial<Window>
  const nav = { userAgent, platform, maxTouchPoints } as Navigator
  Object.assign(win, {
    navigator: nav,
    matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }),
  })
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', nav)
  return win
}

function installPromptEvent(outcome: 'accepted' | 'dismissed'): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  return Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  })
}

describe('pwa install state', () => {
  beforeEach(() => resetPwaInstallStateForTests())
  afterEach(() => vi.unstubAllGlobals())

  it('reports installed when running standalone', () => {
    stubBrowser({ standalone: true })
    expect(getPwaInstallState()).toBe('installed')
  })

  it('offers manual instructions on iPhone and iPadOS', () => {
    stubBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })
    expect(getPwaInstallState()).toBe('ios-manual')

    // iPadOS 13+ masquerades as desktop Safari.
    expect(
      isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 } as Navigator),
    ).toBe(true)
    expect(
      isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 } as Navigator),
    ).toBe(false)
  })

  it('captures beforeinstallprompt and replays it once', async () => {
    const win = stubBrowser()
    initPwaInstallListeners(win as Window)
    const listener = vi.fn()
    subscribePwaInstall(listener)
    expect(getPwaInstallState()).toBe('unavailable')

    const event = installPromptEvent('accepted')
    win.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(listener).toHaveBeenCalled()
    expect(getPwaInstallState()).toBe('promptable')

    await expect(promptInstall()).resolves.toBe(true)
    expect(getPwaInstallState()).toBe('unavailable')
    await expect(promptInstall()).resolves.toBe(false)
  })

  it('switches to installed after appinstalled', () => {
    const win = stubBrowser()
    initPwaInstallListeners(win as Window)
    win.dispatchEvent(installPromptEvent('dismissed'))
    win.dispatchEvent(new Event('appinstalled'))
    expect(getPwaInstallState()).toBe('installed')
  })
})
