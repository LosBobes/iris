import * as Sentry from '@sentry/react'

// Error reporting for the web client.
//
// Sentry is initialized only when VITE_SENTRY_DSN is set at build time, so dev
// builds and source builds without the DSN stay silent. The DSN is baked into
// the production bundle by the frontend image build (see frontend/Dockerfile),
// from the SENTRY_DSN_FRONTEND GitHub Actions secret. A DSN is a client-side
// ingestion key, not a secret, so shipping it in the bundle is expected.
//
// Imported for its side effect from src/main.tsx, before the app renders.
const dsn = import.meta.env.VITE_SENTRY_DSN

/**
 * Browser and extension noise that says nothing about this app.
 *
 * `ResizeObserver loop` is a benign notification every layout-heavy page
 * produces; the rest come from extensions and injected scripts running in the
 * operator's browser, not from code we ship.
 */
const IGNORED_ERRORS = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Non-Error promise rejection captured with value: undefined',
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
]

if (dsn) {
  Sentry.init({
    dsn,
    // MODE is 'production' in the built image and 'development' under `vite`.
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    ignoreErrors: IGNORED_ERRORS,
  })
}

/**
 * Names the operator and organization behind every event from this point on.
 *
 * Iris is multi-tenant and every issue lands with the same Serbian message, so
 * without this an event cannot be traced to a shop, a role, or a person to ask
 * about it — the Sentry "User" section arrives empty. The username and
 * organization slug are the same work identifiers that appear in the API's own
 * logs, which is what makes an event and a server log line joinable.
 */
export function setSentryUser(
  user: AuthenticatedUser,
  organizationSlug: string | null,
): void {
  Sentry.setUser({
    id: user.id,
    username: user.username,
  })
  Sentry.setTag('user.role', user.role)
  Sentry.setTag('organization', organizationSlug ?? '(unknown)')
}

/** Drops the operator's identity from later events (logout, session expiry). */
export function clearSentryUser(): void {
  Sentry.setUser(null)
  Sentry.setTag('user.role', undefined)
  Sentry.setTag('organization', undefined)
}
