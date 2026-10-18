// Info announcements a user dismissed on this device, by id. Warning and
// maintenance ones are never dismissible. Storage can be missing or throw
// (private mode, blocked site data): the banner then simply shows again.

const DISMISSED_KEY = 'iris.announcements.dismissed'
/** Ids kept at most; the oldest drop off first. */
const MAX_DISMISSED = 50

export function readDismissedAnnouncements(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function dismissAnnouncement(id: string): string[] {
  const next = [...readDismissedAnnouncements().filter((existing) => existing !== id), id].slice(-MAX_DISMISSED)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // A per-device convenience; losing it only shows the banner again.
  }
  return next
}
