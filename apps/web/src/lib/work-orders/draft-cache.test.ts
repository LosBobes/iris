import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORK_ORDER_DRAFT_STORAGE_KEY,
  clearWorkOrderDraft,
  readWorkOrderDraft,
  writeWorkOrderDraft,
} from '@/lib/work-orders/draft-cache'
import type { WorkOrderFormValues } from '@/lib/work-orders/validation'

// Minimal in-memory localStorage for the node test environment.
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  })
  return store
}

// Only the fields the cache round-trips need to be real; the rest is opaque JSON.
const SAMPLE_VALUES = {
  clientName: ' Acme d.o.o.',
  jobDescription: 'Vizitkarte',
} as unknown as WorkOrderFormValues

describe('work order draft cache', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('round-trips values and the reserved order number', () => {
    writeWorkOrderDraft('RN-2026-42', SAMPLE_VALUES)

    const draft = readWorkOrderDraft()
    expect(draft).not.toBeNull()
    expect(draft?.orderNumber).toBe('RN-2026-42')
    expect(draft?.values).toEqual(SAMPLE_VALUES)
    expect(typeof draft?.savedAt).toBe('number')
  })

  it('preserves a null reserved number (written before the reservation resolved)', () => {
    writeWorkOrderDraft(null, SAMPLE_VALUES)
    expect(readWorkOrderDraft()?.orderNumber).toBeNull()
  })

  it('returns null when nothing is cached', () => {
    expect(readWorkOrderDraft()).toBeNull()
  })

  it('clears the cached draft', () => {
    writeWorkOrderDraft('RN-2026-42', SAMPLE_VALUES)
    clearWorkOrderDraft()
    expect(readWorkOrderDraft()).toBeNull()
  })

  it('ignores and drops a draft older than the 12h TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T08:00:00Z'))
    writeWorkOrderDraft('RN-2026-42', SAMPLE_VALUES)

    // 13h later the reservation would have lapsed server-side.
    vi.setSystemTime(new Date('2026-07-10T21:00:00Z'))
    expect(readWorkOrderDraft()).toBeNull()
    // Stale entry is evicted, not just skipped.
    expect(localStorage.getItem(WORK_ORDER_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('recovers a draft written just under the TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T08:00:00Z'))
    writeWorkOrderDraft('RN-2026-42', SAMPLE_VALUES)

    vi.setSystemTime(new Date('2026-07-10T19:00:00Z')) // 11h later
    expect(readWorkOrderDraft()?.orderNumber).toBe('RN-2026-42')
  })

  it('returns null for malformed JSON', () => {
    localStorage.setItem(WORK_ORDER_DRAFT_STORAGE_KEY, 'not json{')
    expect(readWorkOrderDraft()).toBeNull()
  })

  it('returns null when the stored shape is missing required fields', () => {
    localStorage.setItem(
      WORK_ORDER_DRAFT_STORAGE_KEY,
      JSON.stringify({ orderNumber: 'RN-2026-42' }),
    )
    expect(readWorkOrderDraft()).toBeNull()
  })
})
