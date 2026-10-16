import { describe, expect, it } from 'vitest'
import { buildServiceWorkerSource } from './vite-plugin'

function parse(source: string): { version: string; urls: string[] } {
  const version = /const PRECACHE_VERSION = (".*?");/.exec(source)?.[1]
  const urls = /const PRECACHE_URLS = (\[.*?\]);/.exec(source)?.[1]
  return { version: JSON.parse(version!), urls: JSON.parse(urls!) }
}

describe('buildServiceWorkerSource', () => {
  it('prefixes the base, sorts, dedupes and drops source maps and the worker itself', () => {
    const source = buildServiceWorkerSource('// template', '/', [
      'assets/index-abc.js',
      'index.html',
      'assets/index-abc.js.map',
      'sw.js',
      'icons/icon-192.png',
      'index.html',
    ])

    expect(parse(source).urls).toEqual([
      '/assets/index-abc.js',
      '/icons/icon-192.png',
      '/index.html',
    ])
    expect(source.endsWith('// template')).toBe(true)
  })

  it('changes the cache version whenever the file list changes', () => {
    const before = parse(buildServiceWorkerSource('', '/', ['assets/a-1.js'])).version
    const same = parse(buildServiceWorkerSource('', '/', ['assets/a-1.js'])).version
    const after = parse(buildServiceWorkerSource('', '/', ['assets/a-2.js'])).version

    expect(same).toBe(before)
    expect(after).not.toBe(before)
  })
})
