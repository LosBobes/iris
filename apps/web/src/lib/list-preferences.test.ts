import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DENSITY,
  DEFAULT_PAGE_SIZE_PREFERENCE,
  getRowHeightClass,
  readStoredDefaultPageSize,
  readStoredDensity,
} from '@/lib/list-preferences'

// Minimal in-memory localStorage — the module runs in the 'node' vitest env,
// which has no DOM storage of its own.
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

afterEach(() => vi.unstubAllGlobals())

describe('getRowHeightClass', () => {
  it('maps known densities and falls back for unknown', () => {
    expect(getRowHeightClass('compact')).toBe('h-8')
    expect(getRowHeightClass('comfortable')).toBe('h-10')
    // @ts-expect-error deliberately passing an invalid density
    expect(getRowHeightClass('bogus')).toBe('h-10')
  })
})

describe('readStoredDensity', () => {
  it('returns a stored valid value and defaults otherwise', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'iris-list-density': 'compact' }))
    expect(readStoredDensity()).toBe('compact')

    vi.stubGlobal('localStorage', fakeStorage({ 'iris-list-density': 'nonsense' }))
    expect(readStoredDensity()).toBe(DEFAULT_DENSITY)
  })
})

describe('readStoredDefaultPageSize', () => {
  it('accepts allowed sizes and rejects out-of-set values', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'iris-default-page-size': '25' }))
    expect(readStoredDefaultPageSize()).toBe(25)

    vi.stubGlobal('localStorage', fakeStorage({ 'iris-default-page-size': '7' }))
    expect(readStoredDefaultPageSize()).toBe(DEFAULT_PAGE_SIZE_PREFERENCE)
  })
})
