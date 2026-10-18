// Cross-tab sign-in/sign-out notices. Every tab shares the session cookie, so
// when one tab signs in, signs out or starts/ends an impersonation, the others
// must drop their (tenant-scoped) query cache and re-check the session instead
// of showing another organization's or a signed-out user's data.
//
// BroadcastChannel where available; otherwise a localStorage write, which
// fires a `storage` event in every other tab. Neither reaches the sending tab.

export type AuthChange = 'login' | 'logout' | 'impersonation-start'

const CHANNEL_NAME = 'iris-auth'
const STORAGE_KEY = 'iris-auth-change'

interface AuthChangeMessage {
  change: AuthChange
  at: number
}

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null
  } catch {
    return null
  }
}

function isAuthChangeMessage(value: unknown): value is AuthChangeMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AuthChangeMessage).change === 'string' &&
    ['login', 'logout', 'impersonation-start'].includes((value as AuthChangeMessage).change)
  )
}

/** Tells the other tabs of this browser that the session changed. */
export function broadcastAuthChange(change: AuthChange): void {
  const message: AuthChangeMessage = { change, at: Date.now() }
  const channel = openChannel()
  if (channel) {
    try {
      channel.postMessage(message)
    } finally {
      channel.close()
    }
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
  } catch {
    // Storage blocked (private mode, quota): other tabs notice on their next
    // request instead.
  }
}

/** Calls listener whenever another tab reports a session change. */
export function subscribeAuthChange(listener: (change: AuthChange) => void): () => void {
  const channel = openChannel()
  if (channel) {
    const onMessage = (event: MessageEvent) => {
      if (isAuthChangeMessage(event.data)) listener(event.data.change)
    }
    channel.addEventListener('message', onMessage)
    return () => {
      channel.removeEventListener('message', onMessage)
      channel.close()
    }
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const parsed: unknown = JSON.parse(event.newValue)
      if (isAuthChangeMessage(parsed)) listener(parsed.change)
    } catch {
      // Not ours.
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
