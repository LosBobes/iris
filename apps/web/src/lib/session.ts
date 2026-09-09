/**
 * Session expiry, from the API layer to the app shell.
 *
 * The session cookie lives for 12 hours and the browser drops it silently when
 * it expires. Nothing re-checked it: the app decided who was logged in once, at
 * startup, and kept that answer for the life of the tab. An operator who left a
 * tab open overnight came back to a UI that still looked signed in, where every
 * request failed with 401 and the page showed a generic load error — the one
 * screen that never mentioned the actual problem.
 *
 * The API client now announces every 401 here, the app shell listens, and the
 * operator is put back on the login form with the reason spelled out and the
 * page they were on remembered.
 */

type SessionExpiredListener = () => void

const listeners = new Set<SessionExpiredListener>()

/**
 * Where to send the operator once they sign in again.
 *
 * Kept in `sessionStorage` rather than in React state so it also survives a
 * reload of the login screen, and scoped to the tab so two tabs on different
 * work orders never send each other to the wrong page.
 */
const RETURN_LOCATION_KEY = 'iris:return-to'

/**
 * Paths worth returning to after a login. The root is where a fresh login lands
 * anyway, and a value that is not a plain absolute path (`//evil.example`, an
 * absolute URL) is not ours to navigate to.
 */
export function isRestorableLocation(location: string): boolean {
  if (!location.startsWith('/')) return false
  if (location.startsWith('//')) return false
  return location !== '/'
}

/**
 * The api-client (and therefore this module) is also exercised outside a
 * browser — unit tests run in Node — so every DOM access is guarded rather
 * than assumed. A missing `window` must never turn a real API error into a
 * `ReferenceError` that hides it.
 */
function browserStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

export function currentLocation(): string {
  if (typeof window === 'undefined') return ''
  const { pathname, search, hash } = window.location
  return `${pathname}${search}${hash}`
}

/**
 * Remembers the page the operator was on. The first call wins: when a session
 * expires, several in-flight requests fail at once, and the page that was open
 * when the first one failed is the page they were actually looking at.
 */
export function rememberReturnLocation(location = currentLocation()): void {
  if (!isRestorableLocation(location)) return
  const storage = browserStorage()
  if (!storage) return
  try {
    if (storage.getItem(RETURN_LOCATION_KEY)) return
    storage.setItem(RETURN_LOCATION_KEY, location)
  } catch {
    // Private mode or blocked storage: the operator still lands on the login
    // form, they just come back to the default page.
  }
}

/** Reads and clears the remembered page. */
export function takeReturnLocation(): string | null {
  const storage = browserStorage()
  if (!storage) return null
  try {
    const stored = storage.getItem(RETURN_LOCATION_KEY)
    storage.removeItem(RETURN_LOCATION_KEY)
    return stored && isRestorableLocation(stored) ? stored : null
  } catch {
    return null
  }
}

export function clearReturnLocation(): void {
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.removeItem(RETURN_LOCATION_KEY)
  } catch {
    // Nothing stored means nothing to clear.
  }
}

/**
 * Announces that the API rejected a request because there is no valid session.
 *
 * Safe to call repeatedly — the app shell only acts on the first one, since a
 * page typically has several requests in flight when the session lapses.
 */
export function notifySessionExpired(): void {
  rememberReturnLocation()
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // A listener that throws must not stop the others, and must not replace
      // the API error the caller is about to see with its own.
    }
  }
}

export function subscribeSessionExpired(
  listener: SessionExpiredListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The organization the current session belongs to.
 *
 * The API's session endpoint returns the user but not their tenant, so the slug
 * typed at login is kept here for the life of the tab. Sentry tags events with
 * it: this is a multi-tenant system, and an event that does not say which shop
 * it came from cannot be acted on.
 */
const ORGANIZATION_SLUG_KEY = 'iris:org-slug'

export function rememberOrganizationSlug(slug: string): void {
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.setItem(ORGANIZATION_SLUG_KEY, slug)
  } catch {
    // Events are tagged '(unknown)' instead; nothing else depends on this.
  }
}

export function activeOrganizationSlug(): string | null {
  const storage = browserStorage()
  if (!storage) return null
  try {
    return storage.getItem(ORGANIZATION_SLUG_KEY)
  } catch {
    return null
  }
}
