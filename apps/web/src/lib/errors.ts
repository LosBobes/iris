import * as Sentry from '@sentry/react'

/**
 * A failed API call, carrying everything needed to diagnose it after the fact.
 *
 * Operators report problems by photographing the screen, so the request
 * reference the API returns (`requestId`, also the X-Request-Id header) is kept
 * on the error and shown in the toast: the same code appears in the server log
 * line and on the Sentry event for that request.
 */
export class ApiError extends Error {
  readonly status: number
  readonly requestId: string | null
  readonly url: string

  constructor(
    message: string,
    options: { status: number; requestId?: string | null; url: string },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.requestId = options.requestId ?? null
    this.url = options.url
  }
}

/** Strips the origin so log/telemetry values group by endpoint, not by host. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/**
 * Reports a failed API call to Sentry.
 *
 * Without this, a request the client handles — a save the API rejects, a 500
 * turned into a toast — was invisible: Sentry only ever saw unhandled
 * exceptions, so the one failure an operator actually notices never produced an
 * event. Expected outcomes (an expired session, a missing record) stay out.
 */
export function reportApiError(error: ApiError): void {
  if (error.status === 401 || error.status === 404) return
  Sentry.captureException(error, {
    level: error.status >= 500 ? 'error' : 'warning',
    tags: {
      'http.status': String(error.status),
      'http.path': pathOf(error.url),
      ...(error.requestId ? { 'request.reference': error.requestId } : {}),
    },
  })
}

/**
 * Builds the message shown to the operator: the action that failed, what the
 * server said about it, and the request reference when there is one.
 */
export function formatActionError(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : ''
  const reference = error instanceof ApiError ? error.requestId : null
  const message = detail === '' ? `${prefix}.` : `${prefix}: ${detail}`
  return reference ? `${message} (kod: ${reference})` : message
}
