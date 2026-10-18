// Injected at build time from the repository-root VERSION file (vite.config.ts).
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? 'dev'

const SEMVER = /^\d+\.\d+\.\d+/

/**
 * Display form of a version: semver gets a "v" prefix ("v2.3.0"); anything
 * else ("dev", an empty value from an older API) is shown as is, or "—".
 */
export function formatVersion(version: string | null | undefined): string {
  const value = (version ?? '').trim()
  if (!value) return '—'
  return SEMVER.test(value) ? `v${value}` : value
}

/**
 * True when two builds report different release versions. A "dev" (source)
 * build or a missing value is not a release, so it never counts as a mismatch.
 */
export function isVersionMismatch(web: string, api: string | null | undefined): boolean {
  const a = web.trim()
  const b = (api ?? '').trim()
  return SEMVER.test(a) && SEMVER.test(b) && a !== b
}
