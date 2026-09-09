import * as Sentry from '@sentry/react'
import i18n from '@/i18n'

/**
 * Path segments that look like identifiers but are fixed sub-resources, so
 * `/work-orders/operators` never collapses into `/work-orders/:id`.
 */
const LITERAL_PATH_SEGMENTS = new Set([
  'auth',
  'catalog-items',
  'cleanup',
  'cost-history',
  'customers',
  'edit-lock',
  'enum-values',
  'healthz',
  'locations',
  'login',
  'logout',
  'operators',
  'preview',
  'public',
  'release-number',
  'report',
  'reserve-number',
  'session',
  'settings',
  'users',
  'work-orders',
])

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Decides whether a path segment is a record identifier rather than part of
 * the route itself.
 *
 * Identifiers in this system are numeric (`179`), slugged with a counter
 * (`cust-1`), prefixed order numbers (`RN-2026-0001`), UUIDs, or opaque public
 * tracking tokens — all of which either carry a digit or are long and random.
 * Fixed sub-resources are short, lowercase, and digit-free.
 */
function isIdentifierSegment(segment: string): boolean {
  if (LITERAL_PATH_SEGMENTS.has(segment)) return false
  if (UUID_PATTERN.test(segment)) return true
  if (/\d/.test(segment)) return true
  // Opaque tokens (public tracking links) can be digit-free but are never
  // as short as a hand-written route segment.
  return segment.length >= 16
}

/**
 * Reduces a request path to its route pattern: `/work-orders/179/report`
 * becomes `/work-orders/:id/report`.
 *
 * Without this every work order produces its own Sentry issue, so one broken
 * endpoint arrives as hundreds of single-event issues instead of one issue
 * with hundreds of events.
 */
export function normalizeRoute(pathOrUrl: string): string {
  let path = pathOrUrl
  try {
    path = new URL(pathOrUrl).pathname
  } catch {
    // Already a path, or something unparseable — fall through and normalize
    // whatever we were given.
    const queryStart = path.search(/[?#]/)
    if (queryStart >= 0) path = path.slice(0, queryStart)
  }

  return (
    path
      .split('/')
      .map((segment) =>
        segment !== '' && isIdentifierSegment(segment) ? ':id' : segment,
      )
      .join('/') || '/'
  )
}

/**
 * A failed API call, carrying everything needed to diagnose it after the fact.
 *
 * Operators report problems by photographing the screen, so the request
 * reference the API returns (`requestId`, also the X-Request-Id header) is kept
 * on the error and shown in the toast: the same code appears in the server log
 * line and on the Sentry event for that request.
 *
 * `message` stays exactly what the API said, because it is what the operator
 * reads in the toast. Everything a developer needs instead — which call, which
 * route, which status — goes into `name`, which is what Sentry renders as the
 * issue title. `ApiError: Potrebna je prijava.` identifies nothing on its own;
 * `ApiError 401 GET /locations (getLocations): Potrebna je prijava.` identifies
 * the failure completely.
 */
export class ApiError extends Error {
  readonly status: number
  readonly requestId: string | null
  readonly url: string
  readonly method: string
  readonly route: string
  operation: string

  constructor(
    message: string,
    options: {
      status: number
      requestId?: string | null
      url: string
      method?: string
      operation?: string
    },
  ) {
    super(message)
    this.status = options.status
    this.requestId = options.requestId ?? null
    this.url = options.url
    this.method = (options.method ?? 'GET').toUpperCase()
    this.route = normalizeRoute(options.url)
    this.operation = options.operation ?? 'unknown'
    this.name = this.describe()
  }

  private describe(): string {
    return `ApiError ${this.status} ${this.method} ${this.route} (${this.operation})`
  }

  /**
   * Names the API call this error came from.
   *
   * The response is parsed before anything knows which client method asked for
   * it, so the operation is attached afterwards by the api-client wrapper. It
   * is set on the one error object belonging to that one call, which keeps it
   * correct when several requests are in flight at once.
   */
  withOperation(operation: string): this {
    this.operation = operation
    this.name = this.describe()
    return this
  }
}

/**
 * A request that never reached the API: the operator is offline, the server is
 * unreachable, or the response was blocked before any status existed.
 *
 * `fetch` reports all of these as a bare `TypeError: Failed to fetch`, which
 * says nothing about what the app was doing. Wrapping it keeps the operation
 * and route on the error for both the toast and Sentry.
 */
export class ApiNetworkError extends Error {
  readonly url: string
  readonly method: string
  readonly route: string
  operation: string

  constructor(options: {
    url: string
    method?: string
    operation?: string
    cause?: unknown
  }) {
    super(i18n.t('common.networkError'), { cause: options.cause })
    this.url = options.url
    this.method = (options.method ?? 'GET').toUpperCase()
    this.route = normalizeRoute(options.url)
    this.operation = options.operation ?? 'unknown'
    this.name = this.describe()
  }

  private describe(): string {
    return `ApiNetworkError ${this.method} ${this.route} (${this.operation})`
  }

  /** See `ApiError.withOperation`. */
  withOperation(operation: string): this {
    this.operation = operation
    this.name = this.describe()
    return this
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
 * A 401 is the app's normal "your session ended" signal, and a 404 is a record
 * that is simply gone. Both are handled in the UI, so neither is a defect worth
 * an issue — but they still belong on the timeline of whatever failure does get
 * reported.
 */
function isExpectedStatus(status: number): boolean {
  return status === 401 || status === 404
}

/**
 * Records an API call on the Sentry breadcrumb trail.
 *
 * Sentry's own fetch breadcrumbs carry the raw URL only. These carry the
 * operation name, so an event reads as the sequence of things the app was
 * doing rather than a list of paths.
 */
export function addApiBreadcrumb(
  operation: string,
  method: string,
  url: string,
  status: number | null,
): void {
  Sentry.addBreadcrumb({
    category: 'api',
    type: 'http',
    level: status !== null && status >= 400 ? 'warning' : 'info',
    message: `${operation} — ${method.toUpperCase()} ${normalizeRoute(url)}`,
    data: {
      operation,
      method: method.toUpperCase(),
      route: normalizeRoute(url),
      ...(status !== null ? { status } : {}),
    },
  })
}

/**
 * Reports a failed API call to Sentry.
 *
 * Without this, a request the client handles — a save the API rejects, a 500
 * turned into a toast — was invisible: Sentry only ever saw unhandled
 * exceptions, so the one failure an operator actually notices never produced an
 * event. Expected outcomes (an expired session, a missing record) stay out.
 *
 * The explicit fingerprint is what keeps the issue list readable: events group
 * by operation and status, so "creating a work order started returning 500" is
 * one issue, not one per work order.
 */
export function reportApiError(error: ApiError): void {
  if (isExpectedStatus(error.status)) return
  Sentry.captureException(error, {
    level: error.status >= 500 ? 'error' : 'warning',
    fingerprint: ['api', error.operation, error.route, String(error.status)],
    tags: {
      'http.status': String(error.status),
      'http.method': error.method,
      'http.route': error.route,
      'http.path': pathOf(error.url),
      'api.operation': error.operation,
      ...(error.requestId ? { 'request.reference': error.requestId } : {}),
    },
    contexts: {
      'API request': {
        operation: error.operation,
        method: error.method,
        route: error.route,
        url: error.url,
        status: error.status,
        'server message': error.message,
        'request reference': error.requestId ?? '(none)',
      },
    },
  })
}

/**
 * Network failures arrive in bursts — an operator whose wifi drops fails every
 * request on the page — so each operation is reported once per page load. That
 * keeps a genuine outage visible (a spike across many operators) without one
 * bad connection filling the issue with hundreds of identical events.
 */
const reportedNetworkFailures = new Set<string>()

export function reportNetworkError(error: ApiNetworkError): void {
  const key = `${error.method} ${error.route}`
  if (reportedNetworkFailures.has(key)) return
  reportedNetworkFailures.add(key)

  Sentry.captureException(error, {
    level: 'warning',
    fingerprint: ['api-network', error.operation, error.route],
    tags: {
      'http.method': error.method,
      'http.route': error.route,
      'api.operation': error.operation,
    },
    contexts: {
      'API request': {
        operation: error.operation,
        method: error.method,
        route: error.route,
        url: error.url,
        online: typeof navigator === 'undefined' ? '(unknown)' : navigator.onLine,
      },
    },
  })
}

/** Test seam: clears the once-per-operation network report guard. */
export function resetNetworkErrorReporting(): void {
  reportedNetworkFailures.clear()
}

/**
 * Reports a failure that is not an API response: a rejected promise in an
 * effect, a handler that threw, a browser API that was unavailable.
 *
 * `where` names the code that failed (e.g. `WorkOrderDetailPage.loadLocations`)
 * and becomes both the Sentry fingerprint and part of the title, so these
 * events say what broke instead of arriving as an anonymous `TypeError`.
 */
export function reportUnexpectedError(
  where: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  // An API error that reaches here was already reported (or deliberately
  // skipped) by the api-client, and a session expiry is an expected flow.
  if (error instanceof ApiError || error instanceof ApiNetworkError) return

  Sentry.captureException(error, {
    level: 'error',
    fingerprint: ['app', where],
    tags: { 'app.where': where },
    contexts: { 'Failure context': { where, ...extra } },
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
