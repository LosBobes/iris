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

if (dsn) {
  Sentry.init({
    dsn,
    // MODE is 'production' in the built image and 'development' under `vite`.
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  })
}
