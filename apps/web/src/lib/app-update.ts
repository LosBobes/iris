import { useEffect, useState } from 'react'
import { APP_VERSION, isVersionMismatch } from '@/lib/app-version'

// A tab (or installed app) left open across a deploy keeps running the code it
// loaded, so new features stay invisible until someone reloads. Production
// builds emit /version.json (pwa/vite-plugin.ts); the open app re-reads it now
// and then and, once the deployed version differs from its own, offers a reload.

/** How often an open, visible tab re-checks the deployed version. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Focus and visibility changes re-check at most this often. */
export const UPDATE_CHECK_MIN_GAP_MS = 60 * 1000

/** The deployed web version, or null when it cannot be read. */
export async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    const version = (body as { version?: unknown } | null)?.version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

interface UpdateCheckOptions {
  /** Off outside production builds: the dev server has no version.json. */
  enabled?: boolean
  currentVersion?: string
  fetchVersion?: () => Promise<string | null>
  intervalMs?: number
  minGapMs?: number
}

/**
 * The newer deployed version once one is found, else null. Checks on mount,
 * every `intervalMs` while the tab is visible, and when the tab regains focus.
 */
export function useAvailableUpdate({
  enabled = import.meta.env.PROD,
  currentVersion = APP_VERSION,
  fetchVersion = fetchDeployedVersion,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  minGapMs = UPDATE_CHECK_MIN_GAP_MS,
}: UpdateCheckOptions = {}): string | null {
  const [available, setAvailable] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || available) return
    let active = true
    let lastCheck = 0

    const check = (force = false) => {
      const now = Date.now()
      if (!force && now - lastCheck < minGapMs) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      lastCheck = now
      void fetchVersion().then((deployed) => {
        if (active && deployed && isVersionMismatch(currentVersion, deployed)) {
          setAvailable(deployed)
        }
      })
    }

    const onWake = () => check()
    check(true)
    const timer = window.setInterval(() => check(true), intervalMs)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [enabled, available, currentVersion, fetchVersion, intervalMs, minGapMs])

  return available
}
