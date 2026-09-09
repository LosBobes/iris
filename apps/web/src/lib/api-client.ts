import type {
  Customer,
  CreateWorkOrderInput,
  CustomerListQuery,
  CustomerListResult,
  EditLock,
  EnumValue,
  EnumValueInput,
  Location,
  PublicWorkOrderStatus,
  ReservedOrderNumber,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListQuery,
  WorkOrderListResult,
} from '@/types/work-order'
import type {
  CatalogCleanupFilter,
  CatalogItem,
  CatalogItemCost,
  CatalogItemInput,
  CatalogItemListResult,
  CatalogItemQuery,
} from '@/types/catalog'
import type { OrganizationSettings } from '@/types/settings'
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
} from '@/types/user'
import i18n from '@/i18n'
import {
  addApiBreadcrumb,
  ApiError,
  ApiNetworkError,
  reportApiError,
  reportNetworkError,
} from '@/lib/errors'
import { notifySessionExpired } from '@/lib/session'

type FetchLike = typeof fetch

function errorField(payload: unknown, field: 'error' | 'requestId'): string | undefined {
  if (typeof payload !== 'object' || payload === null || !(field in payload)) {
    return undefined
  }
  const value = (payload as Record<string, unknown>)[field]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * The method and URL each response was actually requested with.
 *
 * A `Response` carries neither its method nor, reliably, its URL: `response.url`
 * is empty on a synthesised response and follows redirects on a real one. The
 * error is built where only the response is in scope, so the request details are
 * recorded here as the response comes back. Keying by the response object keeps
 * the answer right when several requests are in flight, and the weak reference
 * means nothing is retained after the response is discarded.
 */
const requestDetails = new WeakMap<Response, { method: string; url: string }>()

/**
 * Every route behind `requireAuth` answers 401 once the session cookie is gone,
 * and only those routes ever do — `/auth/*` reports a rejected login as a 200
 * with `success: false`. So a 401 here always means "this session ended", which
 * the app shell turns into a forced re-login. The check on `/auth/` is
 * belt-and-braces: a future auth route that did answer 401 must not bounce the
 * operator off the login form they are already looking at.
 */
function announceIfSessionExpired(status: number, url: string): void {
  if (status !== 401) return
  let path = url
  try {
    path = new URL(url).pathname
  } catch {
    // Relative or unparseable; match on whatever we were given.
  }
  if (path.startsWith('/auth/')) return
  notifySessionExpired()
}

// fail builds the error and throws it. Reporting happens in the operation
// wrapper below, which is the only place that knows which client method the
// call came from.
function fail(
  message: string,
  response: Response,
  payload: unknown,
): never {
  const request = requestDetails.get(response)
  const error = new ApiError(message, {
    status: response.status,
    requestId:
      errorField(payload, 'requestId') ?? response.headers.get('X-Request-Id'),
    url: request?.url || response.url,
    method: request?.method,
  })
  announceIfSessionExpired(error.status, error.url)
  throw error
}

async function readJSON<T>(response: Response): Promise<T> {
  // Error responses are not guaranteed to be JSON (e.g. an HTML page from a
  // proxy), so parse failures must not mask the HTTP status.
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    fail(
      errorField(payload, 'error') ?? `HTTP ${response.status}`,
      response,
      payload,
    )
  }

  if (payload === undefined) {
    fail('Neispravan odgovor servera.', response, payload)
  }

  return payload as T
}

function readArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

// normalizeWorkOrder coerces any null collection fields back to empty arrays.
// The API contract declares these as arrays, but legacy/nil-slice payloads can
// surface as `null` (Go encodes a nil slice as null); without this guard the
// detail page crashes reading `.length` on a specific work order.
function normalizeWorkOrder(order: WorkOrder): WorkOrder {
  return {
    ...order,
    statusHistory: readArray(order?.statusHistory),
    internalNotes: readArray(order?.internalNotes),
    customerNotes: readArray(order?.customerNotes),
    events: readArray(order?.events),
    attachments: readArray(order?.attachments),
    materialUsage: readArray(order?.materialUsage),
    timeEntries: readArray(order?.timeEntries),
    invoiceDraft: {
      ...order?.invoiceDraft,
      lineItems: readArray(order?.invoiceDraft?.lineItems),
    },
  }
}

function normalizeWorkOrderListResult(value: WorkOrderListResult): WorkOrderListResult {
  return {
    ...value,
    items: readArray(value.items).map(normalizeWorkOrder),
    total: value.total ?? 0,
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function credentialedRequest(init: RequestInit = {}): RequestInit {
  return { ...init, credentials: 'include' }
}

function queryString(query: WorkOrderListQuery = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

// catalogCleanupQuery encodes a cleanup filter the way the API expects it: one
// repeated `kind` parameter per selected kind, plus the `missing` price mode.
// The preview and the delete use the identical string, so what an admin sees is
// exactly what gets removed.
function catalogCleanupQuery(filter: CatalogCleanupFilter): string {
  const params = new URLSearchParams()
  for (const kind of filter.kinds) params.append('kind', kind)
  params.set('missing', filter.missing)
  return params.toString()
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Names every failure after the client method that produced it, and reports it.
 *
 * Reporting lives here rather than at the throw site because this is the only
 * layer that knows a request was `getLocations` and not just `GET /locations`.
 * A Sentry event that says `getLocations` is one an engineer can grep for; a
 * minified frame called `ns` is not, and production bundles have no source maps.
 *
 * Synchronous members (the URL builders) are passed through untouched, so
 * wrapping does not turn them into promises.
 */
function withOperationReporting(api: Window['api']): Window['api'] {
  const report = (operation: string, error: unknown): void => {
    if (error instanceof ApiError) {
      error.withOperation(operation)
      addApiBreadcrumb(operation, error.method, error.url, error.status)
      reportApiError(error)
      return
    }
    if (error instanceof ApiNetworkError) {
      error.withOperation(operation)
      addApiBreadcrumb(operation, error.method, error.url, null)
      reportNetworkError(error)
    }
  }

  const entries = Object.entries(api).map(([operation, value]) => {
    if (typeof value !== 'function') return [operation, value] as const

    const original = value as (...args: never[]) => unknown
    const wrapped = (...args: never[]): unknown => {
      let result: unknown
      try {
        result = original(...args)
      } catch (error) {
        report(operation, error)
        throw error
      }
      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          report(operation, error)
          throw error
        })
      }
      return result
    }
    return [operation, wrapped] as const
  })

  return Object.fromEntries(entries) as Window['api']
}

export function createHttpApi(baseUrl: string, baseFetch: FetchLike = fetch): Window['api'] {
  const url = (path: string): string => joinUrl(baseUrl, path)

  // Records the method each response was fetched with, and turns a transport
  // failure — offline, DNS, a blocked response — into an error that names the
  // route instead of the bare `TypeError: Failed to fetch` the browser throws.
  const fetchImpl: FetchLike = async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    try {
      const response = await baseFetch(input, init)
      requestDetails.set(response, { method, url: requestUrl(input) })
      return response
    } catch (cause) {
      if (cause instanceof ApiNetworkError) throw cause
      throw new ApiNetworkError({ url: requestUrl(input), method, cause })
    }
  }

  return withOperationReporting({
    async getAppVersion() {
      return '0.1.0-dev'
    },

    async getBackendStatus() {
      const unavailable = {
        ready: false as const,
        message: i18n.t('common.backendUnavailable'),
      }
      try {
        const response = await fetchImpl(url('/healthz'), credentialedRequest())
        if (!response.ok) {
          return unavailable
        }
        const payload = (await response.json()) as { status?: string }
        if (payload.status !== 'ok') {
          return unavailable
        }
        return { ready: true as const }
      } catch {
        return unavailable
      }
    },

    async login(credentials) {
      const response = await fetchImpl(url('/auth/login'), jsonRequest('POST', credentials))
      return readJSON<LoginResponse>(response)
    },

    async getCurrentSession() {
      const response = await fetchImpl(url('/auth/session'), credentialedRequest())
      return readJSON<LoginResponse>(response)
    },

    async logout() {
      const response = await fetchImpl(url('/auth/logout'), credentialedRequest({ method: 'POST' }))
      await readJSON<{ success: boolean }>(response)
    },

    async getCustomers(query: CustomerListQuery = {}) {
      const params = new URLSearchParams()
      if (query.q) params.set('q', query.q)
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.offset !== undefined) params.set('offset', String(query.offset))
      const search = params.toString()
      const response = await fetchImpl(
        url(`/customers${search ? `?${search}` : ''}`),
        credentialedRequest(),
      )
      const result = await readJSON<CustomerListResult>(response)
      return { items: readArray(result?.items), total: result?.total ?? 0 }
    },

    async getCustomerById(id: string) {
      const response = await fetchImpl(
        url(`/customers/${encodeURIComponent(id)}`),
        credentialedRequest(),
      )
      if (response.status === 404) return null
      return readJSON<Customer>(response)
    },

    async upsertCustomer(customer) {
      const response = await fetchImpl(
        url(`/customers/${encodeURIComponent(customer.id)}`),
        jsonRequest('PUT', customer),
      )
      return readJSON<Customer>(response)
    },

    async deleteCustomer(id) {
      const response = await fetchImpl(
        url(`/customers/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      return readJSON<{ success: boolean }>(response)
    },

    async getLocations(customerId?: string) {
      const path = customerId
        ? `/locations?customerId=${encodeURIComponent(customerId)}`
        : '/locations'
      const response = await fetchImpl(url(path), credentialedRequest())
      return readArray(await readJSON<Location[] | null>(response))
    },

    async upsertLocation(location) {
      const response = await fetchImpl(
        url(`/locations/${encodeURIComponent(location.id)}`),
        jsonRequest('PUT', location),
      )
      return readJSON<Location>(response)
    },

    async deleteLocation(id) {
      const response = await fetchImpl(
        url(`/locations/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      return readJSON<{ success: boolean }>(response)
    },

    async getEnumValues() {
      const response = await fetchImpl(url('/enum-values'), credentialedRequest())
      return readArray(await readJSON<EnumValue[] | null>(response))
    },

    async createEnumValue(input: EnumValueInput) {
      const response = await fetchImpl(url('/enum-values'), jsonRequest('POST', input))
      return readJSON<EnumValue>(response)
    },

    async updateEnumValue(id: string, input: EnumValueInput) {
      const response = await fetchImpl(
        url(`/enum-values/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<EnumValue>(response)
    },

    async deleteEnumValue(id: string) {
      const response = await fetchImpl(
        url(`/enum-values/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      return readJSON<{ success: boolean }>(response)
    },

    async getCatalogItems(query: CatalogItemQuery = {}) {
      const params = new URLSearchParams()
      if (query.kind) params.set('kind', query.kind)
      if (query.q) params.set('q', query.q)
      if (query.active) params.set('active', 'true')
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.offset !== undefined) params.set('offset', String(query.offset))
      const search = params.toString()
      const response = await fetchImpl(
        url(`/catalog-items${search ? `?${search}` : ''}`),
        credentialedRequest(),
      )
      const result = await readJSON<CatalogItemListResult>(response)
      return { items: readArray(result?.items), total: result?.total ?? 0 }
    },

    async getCatalogItemById(id: string) {
      const response = await fetchImpl(
        url(`/catalog-items/${encodeURIComponent(id)}`),
        credentialedRequest(),
      )
      if (response.status === 404) return null
      return readJSON<CatalogItem>(response)
    },

    async getCatalogItemCostHistory(id: string) {
      const response = await fetchImpl(
        url(`/catalog-items/${encodeURIComponent(id)}/cost-history`),
        credentialedRequest(),
      )
      const result = await readJSON<{ items: CatalogItemCost[] }>(response)
      return readArray(result?.items)
    },

    async createCatalogItem(input: CatalogItemInput) {
      const response = await fetchImpl(url('/catalog-items'), jsonRequest('POST', input))
      return readJSON<CatalogItem>(response)
    },

    async updateCatalogItem(id: string, input: CatalogItemInput) {
      const response = await fetchImpl(
        url(`/catalog-items/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<CatalogItem>(response)
    },

    async deleteCatalogItem(id: string) {
      const response = await fetchImpl(
        url(`/catalog-items/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      return readJSON<{ success: boolean }>(response)
    },

    async previewCatalogCleanup(filter) {
      const response = await fetchImpl(
        url(`/catalog-items/cleanup?${catalogCleanupQuery(filter)}`),
        credentialedRequest(),
      )
      const result = await readJSON<CatalogItemListResult>(response)
      return { items: readArray(result?.items), total: result?.total ?? 0 }
    },

    async cleanupCatalogItems(filter) {
      const response = await fetchImpl(
        url(`/catalog-items/cleanup?${catalogCleanupQuery(filter)}`),
        credentialedRequest({ method: 'POST' }),
      )
      return readJSON<{ deleted: number }>(response)
    },

    async getSettings() {
      const response = await fetchImpl(url('/settings'), credentialedRequest())
      return readJSON<OrganizationSettings>(response)
    },

    async updateSettings(settings: Partial<OrganizationSettings>) {
      const response = await fetchImpl(url('/settings'), jsonRequest('PUT', settings))
      return readJSON<OrganizationSettings>(response)
    },

    async listUsers() {
      const response = await fetchImpl(url('/users'), credentialedRequest())
      return readArray(await readJSON<ManagedUser[]>(response))
    },

    async createUser(input: CreateUserInput) {
      const response = await fetchImpl(url('/users'), jsonRequest('POST', input))
      return readJSON<ManagedUser>(response)
    },

    async updateUser(id: string, input: UpdateUserInput) {
      const response = await fetchImpl(
        url(`/users/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<ManagedUser>(response)
    },

    async deleteUser(id: string) {
      const response = await fetchImpl(
        url(`/users/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      return readJSON<{ success: boolean }>(response)
    },

    async getWorkOrders(query) {
      const response = await fetchImpl(url(`/work-orders${queryString(query)}`), credentialedRequest())
      return normalizeWorkOrderListResult(await readJSON<WorkOrderListResult>(response))
    },

    async getWorkOrderOperators() {
      const response = await fetchImpl(url('/work-orders/operators'), credentialedRequest())
      return readArray(await readJSON<string[] | null>(response))
    },

    async getWorkOrderById(id) {
      const response = await fetchImpl(url(`/work-orders/${encodeURIComponent(id)}`), credentialedRequest())
      if (response.status === 404) return null
      return normalizeWorkOrder(await readJSON<WorkOrder>(response))
    },

    async reserveWorkOrderNumber() {
      const response = await fetchImpl(url('/work-orders/reserve-number'), jsonRequest('POST', {}))
      return readJSON<ReservedOrderNumber>(response)
    },

    async releaseWorkOrderNumber(orderNumber: string) {
      await fetchImpl(url('/work-orders/release-number'), jsonRequest('POST', { orderNumber }))
    },

    async acquireWorkOrderEditLock(id: string) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(id)}/edit-lock`),
        jsonRequest('POST', {}),
      )
      // 200 = we hold the lock; 409 = someone else is editing. Both carry an
      // EditLock body describing the holder, so 409 is a normal outcome here
      // rather than an error (readJSON would throw on the non-2xx status).
      if (response.status === 409) {
        return { acquired: false, lock: (await response.json()) as EditLock }
      }
      return { acquired: true, lock: await readJSON<EditLock>(response) }
    },

    async releaseWorkOrderEditLock(id: string) {
      await fetchImpl(
        url(`/work-orders/${encodeURIComponent(id)}/edit-lock`),
        credentialedRequest({ method: 'DELETE' }),
      )
    },

    async createWorkOrder(input: CreateWorkOrderInput) {
      const response = await fetchImpl(url('/work-orders'), jsonRequest('POST', input))
      return normalizeWorkOrder(await readJSON<WorkOrder>(response))
    },

    async updateWorkOrder(id: string, changes: UpdateWorkOrderInput) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(id)}`),
        jsonRequest('PATCH', changes),
      )
      if (response.status === 404) return null
      return normalizeWorkOrder(await readJSON<WorkOrder>(response))
    },

    async deleteWorkOrder(id: string) {
      const response = await fetchImpl(url(`/work-orders/${encodeURIComponent(id)}`), credentialedRequest({
        method: 'DELETE',
      }))
      return readJSON<DeleteWorkOrderResponse>(response)
    },

    async getWorkOrderPreviewHtml(order: WorkOrder) {
      const response = await fetchImpl(url('/work-orders/preview'), jsonRequest('POST', order))
      // The response is HTML rather than JSON, but the failure path is the same
      // one every other call uses: a bare `Error` here would carry no status and
      // no request reference, and would look like a defect rather than a session
      // that lapsed.
      if (!response.ok) fail(i18n.t('common.previewError'), response, undefined)
      return response.text()
    },

    async getPublicWorkOrderStatus(token: string) {
      const response = await fetchImpl(
        url(`/public/work-orders/${encodeURIComponent(token)}`),
        credentialedRequest(),
      )
      if (response.status === 404) return null
      return readJSON<PublicWorkOrderStatus>(response)
    },

    getPublicTrackingUrl(token: string) {
      const publicOrigin = typeof window === 'undefined' ? baseUrl : window.location.origin
      return `${publicOrigin}/public/work-orders/${encodeURIComponent(token)}`
    },

    getWorkOrderReportUrl(id: string) {
      return url(`/work-orders/${encodeURIComponent(id)}/report`)
    },
  })
}
