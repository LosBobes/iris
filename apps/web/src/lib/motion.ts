import type { CSSProperties } from 'react'

/** Rows/tiles beyond this index enter without extra delay so long lists never crawl. */
export const STAGGER_CAP = 12

/** Stagger slot for the item at `index`; items past `cap` get slot 0 (no added delay). */
export function staggerIndex(index: number, cap: number = STAGGER_CAP): number {
  return index >= 0 && index < cap ? index : 0
}

/** Inline style carrying `--iris-stagger-index`, read by `.iris-stagger` / `.iris-node-enter`. */
export function staggerStyle(index: number, cap: number = STAGGER_CAP): CSSProperties {
  return { '--iris-stagger-index': staggerIndex(index, cap) } as CSSProperties
}

/** True when `next` contains an entry that `prev` did not (used to shake only on new errors). */
export function hasNewItems(prev: readonly string[], next: readonly string[]): boolean {
  const seen = new Set(prev)
  return next.some((item) => !seen.has(item))
}

/** Clamp a 0-100 percentage into a 0-1 scale factor. */
export function percentToScale(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(1, Math.max(0, percent / 100))
}
