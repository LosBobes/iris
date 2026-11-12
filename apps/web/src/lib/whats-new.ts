/**
 * Šta je novo (What's new): one entry per change people will notice, newest
 * first. Every PR that adds or changes something on screen adds an entry here
 * (root CLAUDE.md, "What's new"), with its words under `whatsNew.entries` in
 * both locales and its looping demo in `components/whats-new/WhatsNewArt.tsx`.
 *
 * The dialog opens by itself once after an entry lands
 * (`components/whats-new/WhatsNewHost.tsx`), showing only what this account
 * has not seen in this browser. Iris does not know when an account was made,
 * so a browser with no record at all (a newcomer, or a cleared browser) is
 * only handed the last `FRESH_DAYS` of news, not the whole history.
 */

export type WhatsNewId =
  | 'longOrderPrint'
  | 'livePdv'
  | 'catalogPrices'
  | 'catalogLinks'
  | 'bulkCosts'
  | 'companySort'
  | 'whatsNew'
  | 'companyOrders'
  | 'packages'
  | 'updateBanner'

export type Audience = 'admins' | 'operators'

export interface WhatsNewEntry {
  /** Stable: it is what "seen" remembers. Also the key of its words in i18n. */
  id: WhatsNewId
  /** The day it reached the app, `YYYY-MM-DD`. */
  date: string
  /** Who it is for: `admins` for what only admins can see or do (the
   *  dashboard's finance section, Settings, users), `operators` for what only
   *  operators meet (or what an admin already knows from the other side).
   *  Left out, everyone sees it. A reader never sees the other side's. */
  for?: Audience
}

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  { id: 'longOrderPrint', date: '2026-11-12' },
  { id: 'livePdv', date: '2026-11-09' },
  { id: 'catalogPrices', date: '2026-11-09', for: 'admins' },
  { id: 'catalogLinks', date: '2026-11-09' },
  { id: 'bulkCosts', date: '2026-11-09', for: 'admins' },
  { id: 'companySort', date: '2026-11-09', for: 'admins' },
  { id: 'whatsNew', date: '2026-11-09' },
  { id: 'companyOrders', date: '2026-11-09', for: 'admins' },
  { id: 'packages', date: '2026-10-29' },
  { id: 'updateBanner', date: '2026-10-29' },
]

/** How far back a browser with no record of what it has seen is taken. */
export const FRESH_DAYS = 30

/** The entries a reader is shown: everyone's plus their own side's, never the other side's. */
export function forReader(entries: readonly WhatsNewEntry[], admin: boolean): WhatsNewEntry[] {
  return entries.filter((e) => !e.for || e.for === (admin ? 'admins' : 'operators'))
}

function isoDaysBefore(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d - days))
  return date.toISOString().slice(0, 10)
}

/**
 * The entries to open with: not seen yet. With no record at all (`seen` null),
 * only those from the last `FRESH_DAYS` before `today` (`YYYY-MM-DD`).
 */
export function unseen(
  entries: readonly WhatsNewEntry[],
  seen: readonly string[] | null,
  today: string,
): WhatsNewEntry[] {
  if (seen === null) {
    const since = isoDaysBefore(today, FRESH_DAYS)
    return entries.filter((e) => e.date > since)
  }
  return entries.filter((e) => !seen.includes(e.id))
}

/** Today as a local `YYYY-MM-DD` (never `toISOString()`, which is UTC). */
export function todayISO(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const SEEN_KEY = 'iris.whatsNewSeen'

/** What this account has seen in this browser, or null when there is no record. */
export function loadSeen(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`${SEEN_KEY}.${userId}`)
    if (raw === null) return null
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return null
  }
}

export function markSeen(userId: string, ids: readonly string[]): void {
  try {
    const all = Array.from(new Set([...(loadSeen(userId) ?? []), ...ids]))
    localStorage.setItem(`${SEEN_KEY}.${userId}`, JSON.stringify(all))
  } catch {
    /* no storage: it shows again next time, which is harmless */
  }
}

// --- Opening it from anywhere (the Help page) -------------------------------

type Listener = () => void
const listeners = new Set<Listener>()

/** Opens the dialog with every entry for this reader (Help → "Šta je novo"). */
export function openWhatsNew(): void {
  for (const listener of listeners) listener()
}

export function onOpenWhatsNew(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
