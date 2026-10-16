// Progressive Web App wiring: service worker registration and the "install
// app" state shown in Settings.
//
// Android/desktop Chromium fire `beforeinstallprompt`, which can be stashed and
// replayed from a button. iOS/iPadOS Safari has no such event — installing is
// only possible by hand via Share → "Add to Home Screen" — so for those
// devices the UI shows instructions instead of a button.

/** Chromium's install prompt event (not in lib.dom.d.ts). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type PwaInstallState =
  /** Already running as an installed app. */
  | 'installed'
  /** The browser offered an install prompt; `promptInstall` will show it. */
  | 'promptable'
  /** iOS/iPadOS: install by hand from the Share menu. */
  | 'ios-manual'
  /** Nothing to offer (unsupported browser, or the prompt was used up). */
  | 'unavailable'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedThisSession = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's pre-standard flag for home-screen apps.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIosDevice(nav: Navigator = navigator): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true
  // iPadOS 13+ reports itself as desktop Safari; touch support gives it away.
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1
}

export function getPwaInstallState(): PwaInstallState {
  if (installedThisSession || isStandalone()) return 'installed'
  if (deferredPrompt) return 'promptable'
  if (isIosDevice()) return 'ios-manual'
  return 'unavailable'
}

/** Shows the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt
  if (!event) return false
  // A prompt event can only be used once.
  deferredPrompt = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

/**
 * Starts listening for install events. Must run at startup, not when Settings
 * mounts: Chromium fires `beforeinstallprompt` once, shortly after load.
 */
export function initPwaInstallListeners(win: Window = window): void {
  win.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar; Settings offers the prompt instead.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  win.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installedThisSession = true
    notify()
  })
}

/**
 * Registers /sw.js (emitted by pwa/vite-plugin.ts) in production builds. The
 * dev server has no worker, and an old one left registered from a production
 * build on the same origin would serve stale chunks, so it is not registered
 * there.
 */
export function registerServiceWorker(nav: Navigator = navigator): void {
  if (!import.meta.env.PROD || !('serviceWorker' in nav)) return
  window.addEventListener('load', () => {
    nav.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      // Not fatal: the app works exactly as before, just not offline.
      console.warn('Service worker registration failed', error)
    })
  })
}

/** Test-only: forget captured events between cases. */
export function resetPwaInstallStateForTests(): void {
  deferredPrompt = null
  installedThisSession = false
  listeners.clear()
}
