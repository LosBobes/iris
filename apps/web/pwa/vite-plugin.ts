import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const TEMPLATE_PATH = resolve(import.meta.dirname, 'service-worker.js')

// Source maps are never fetched by the app, and the worker itself must not
// precache itself.
const EXCLUDED = [/\.map$/, /^sw\.js$/]

function listPublicFiles(publicDir: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory()
        ? walk(full)
        : [relative(publicDir, full).split(sep).join('/')]
    })
  try {
    return walk(publicDir)
  } catch {
    return []
  }
}

/**
 * Builds the source of /sw.js: the template with the precache list and a
 * version derived from it, so every deploy that changes any file name (Vite
 * hashes them) gets a new cache and drops the previous one.
 */
export function buildServiceWorkerSource(
  template: string,
  base: string,
  files: string[],
): string {
  const urls = [...new Set(files)]
    .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)))
    .sort()
    .map((file) => `${base}${file}`)
  const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12)
  return [
    `const PRECACHE_VERSION = ${JSON.stringify(version)};`,
    `const PRECACHE_URLS = ${JSON.stringify(urls)};`,
    '',
    template,
  ].join('\n')
}

/** Emits /sw.js for production builds; the dev server never registers it. */
export function irisServiceWorker(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'iris-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    generateBundle(_options, bundle) {
      const files = [
        ...Object.keys(bundle),
        ...(config.publicDir ? listPublicFiles(config.publicDir) : []),
      ]
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: buildServiceWorkerSource(
          readFileSync(TEMPLATE_PATH, 'utf8'),
          config.base,
          files,
        ),
      })
    },
  }
}
