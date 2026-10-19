import { APP_VERSION } from '@/lib/app-version'
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
import type { ClientAttentionRow, DashboardData, DashboardQuery } from '@/types/dashboard'
import type {
  CatalogCleanupFilter,
  CatalogItem,
  CatalogItemCost,
  CatalogItemInput,
  CatalogItemListResult,
  CatalogItemQuery,
} from '@/types/catalog'
import type {
  LoginLogoInfo,
  LoginLogoUpload,
  OrganizationModules,
  OrganizationSettings,
  PublicOrganization,
} from '@/types/settings'
import { normalizeOrganizationModules } from '@/types/settings'
import type {
  PlatformLoginResponse,
  PlatformMetrics,
  PlatformPasswordChange,
  PlatformRangeDays,
  PlatformTenantDeletion,
  PlatformTenantExportFile,
  PlatformTenantUsers,
  PlatformImpersonationResponse,
  PlatformImpersonationAction,
  PlatformAuditLog,
  PlatformBackup,
  PlatformBackups,
  PlatformTenant,
  PlatformCreateTenantInput,
  PlatformTenantNotesInput,
  PlatformUpdateTenantInput,
  PlatformTwoFactorSetup,
  PlatformTwoFactorEnabled,
  PlatformAdminSummary,
  PlatformCreateAdminInput,
} from '@/types/platform'
import type { Announcement, PlatformAnnouncement, PlatformAnnouncementInput } from '@/types/announcement'
import type {
  ProcessGraph,
  ProcessTemplate,
  ProcessTemplateInput,
  WorkOrderProcess,
  WorkOrderProcessInput,
} from '@/types/process'
import type {
  StockCountInput,
  StockLevelList,
  StockLevelQuery,
  StockMovementList,
  StockMovementQuery,
  StockPostingResult,
  StockReceiptInput,
} from '@/types/stock'
import type {
  AttendanceEntry,
  AttendanceInput,
  Machine,
  MachineDowntime,
  MachineDowntimeInput,
  MachineInput,
  MachineType,
  MachineTypeInput,
  MyQueue,
  OrderForecast,
  PlanDay,
  PlanDayHorizon,
  PlanDraftInput,
  PlanHorizon,
  PlanGenerateInput,
  PlanPublishInput,
  ProductionPlan,
  WorkerQualifications,
  WorkerQualificationsInput,
  WorkingHours,
} from '@/types/planning'
import type { MaterialNeeds, MaterialNeedsItem, MaterialNeedsQuery } from '@/types/planning'
import type { WorkstationLoad, WorkstationLoadDay, WorkstationLoadQuery } from '@/types/planning'
import type { PlanningCalibration, PlanningCalibrationQuery } from '@/types/planning'
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
  type ResponseBodyFailure,
  reportApiError,
  reportNetworkError,
} from '@/lib/errors'
import { notifySessionExpired } from '@/lib/session'

type FetchLike = typeof fetch

function normalizeAssignment<T extends { userIds: string[] }>(a: T): T {
  return { ...a, userIds: readArray(a.userIds) }
}

function normalizePlan(plan: ProductionPlan): ProductionPlan {
  return {
    ...plan,
    horizonEnd: plan.horizonEnd || plan.date,
    assignments: readArray(plan.assignments).map(normalizeAssignment),
    issues: readArray(plan.issues),
    lateOrders: readArray(plan.lateOrders),
  }
}

function normalizePlanHorizon(horizon: PlanHorizon): PlanHorizon {
  return {
    ...horizon,
    horizonEnd: horizon.horizonEnd || horizon.date,
    days: readArray(horizon.days).map((day) => ({
      ...day,
      assignments: readArray(day.assignments).map(normalizeAssignment),
    })),
    issues: readArray(horizon.issues),
  }
}

function normalizeWorkingHours(hours: WorkingHours): WorkingHours {
  return {
    ...hours,
    days: readArray(hours?.days).map((day) => ({ ...day, breaks: readArray(day.breaks) })),
    // Settings saved before D-028 have no inter-operation time or exceptions.
    transferMinutes: typeof hours?.transferMinutes === 'number' && Number.isFinite(hours.transferMinutes) ? hours.transferMinutes : 0,
    exceptions: readArray(hours?.exceptions).map((exception) => ({ ...exception, breaks: readArray(exception.breaks) })),
  }
}

/** Settings from an older server may lack `modules`: treat that as both off. */
function withModules(settings: OrganizationSettings): OrganizationSettings {
  return { ...settings, modules: normalizeOrganizationModules(settings.modules) }
}

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
  // Auth routes, and the Backoffice, which has its own session: a 401
  // there says nothing about the organization session.
  if (/(^|\/)(auth|platform)\//.test(path)) return
  notifySessionExpired()
}

// fail builds the error and throws it. Reporting happens in the operation
// wrapper below, which is the only place that knows which client method the
// call came from.
function fail(
  message: string,
  response: Response,
  payload: unknown,
  bodyFailure?: ResponseBodyFailure,
): never {
  const request = requestDetails.get(response)
  const error = new ApiError(message, {
    status: response.status,
    requestId:
      errorField(payload, 'requestId') ?? response.headers.get('X-Request-Id'),
    url: request?.url || response.url,
    method: request?.method,
    bodyFailure,
  })
  announceIfSessionExpired(error.status, error.url)
  throw error
}

/**
 * Bodies the fetch wrapper already read (and parsed) on the way in, keyed by
 * the response it handed back. A GET's JSON body is read eagerly so that a
 * body that fails mid-transfer can be retried while the request is still in
 * the wrapper's hands; see `bufferJSONBody`.
 */
const bufferedBodies = new WeakMap<
  Response,
  { payload: unknown; failure: ResponseBodyFailure | null }
>()

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

function bodyFailure(
  response: Response,
  stage: ResponseBodyFailure['stage'],
  error: unknown,
  receivedChars: number,
  attempts: number,
): ResponseBodyFailure {
  return {
    stage,
    reason: describeError(error),
    contentType: response.headers.get('Content-Type') ?? '(none)',
    contentLength: response.headers.get('Content-Length') ?? '(none)',
    receivedChars,
    attempts,
  }
}

function isJSONResponse(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').includes('application/json')
}

/**
 * Reads and parses a JSON response body up front, returning a fresh Response
 * that replays it plus whether the read or parse failed.
 *
 * Production saw 200 responses whose body never arrived intact (Sentry
 * IRIS-FE-8/9/A): the status line and headers came through, then the body
 * stream broke, and the list page showed "Neispravan odgovor servera." Reading
 * the body here — instead of later in `readJSON` — is what makes a retry
 * possible, because only the fetch wrapper can send the request again.
 */
async function bufferJSONBody(
  response: Response,
  attempts: number,
): Promise<{ response: Response; failure: ResponseBodyFailure | null }> {
  const init = {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  }
  let text: string
  try {
    text = await response.text()
  } catch (error) {
    const failure = bodyFailure(response, 'read', error, 0, attempts)
    const replay = new Response(null, init)
    bufferedBodies.set(replay, { payload: undefined, failure })
    return { response: replay, failure }
  }

  let payload: unknown
  let failure: ResponseBodyFailure | null = null
  try {
    payload = JSON.parse(text)
  } catch (error) {
    payload = undefined
    failure = bodyFailure(response, 'parse', error, text.length, attempts)
  }
  // A null-body status (204/304) cannot be constructed with a body.
  const replay = new Response(text === '' ? null : text, init)
  bufferedBodies.set(replay, { payload, failure })
  return { response: replay, failure }
}

// A successful 204 has no body to parse; anything else goes through readJSON so
// the failure carries the server's message and status like every other call.
async function readNoContent(response: Response): Promise<void> {
  if (response.ok) return
  await readJSON<unknown>(response)
}

async function readJSON<T>(response: Response): Promise<T> {
  // Error responses are not guaranteed to be JSON (e.g. an HTML page from a
  // proxy), so parse failures must not mask the HTTP status.
  let payload: unknown
  let failure: ResponseBodyFailure | null = null
  const buffered = bufferedBodies.get(response)
  if (buffered) {
    payload = buffered.payload
    failure = buffered.failure
  } else {
    let text: string | null = null
    try {
      text = await response.text()
      payload = JSON.parse(text)
    } catch (error) {
      payload = undefined
      failure = bodyFailure(response, text === null ? 'read' : 'parse', error, text?.length ?? 0, 1)
    }
  }

  if (!response.ok) {
    fail(
      errorField(payload, 'error') ?? `HTTP ${response.status}`,
      response,
      payload,
    )
  }

  if (payload === undefined) {
    fail('Neispravan odgovor servera.', response, payload, failure ?? undefined)
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

// normalizeGraph guards against a nil Go slice surfacing as null.
function normalizeGraph(graph: ProcessGraph | null | undefined): ProcessGraph {
  return { nodes: readArray(graph?.nodes), edges: readArray(graph?.edges) }
}

function normalizeTemplate(template: ProcessTemplate): ProcessTemplate {
  return { ...template, graph: normalizeGraph(template?.graph) }
}

function normalizeProcess(process: WorkOrderProcess): WorkOrderProcess {
  return { ...process, graph: normalizeGraph(process?.graph), quantitiesPerOrder: Boolean(process?.quantitiesPerOrder) }
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

function queryString(query: WorkOrderListQuery | DashboardQuery = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

// normalizeDashboardData guards against a server that serializes empty lists
// as null, so the dashboard components can always map over arrays.
function normalizeDashboardData(data: DashboardData): DashboardData {
  const rows = (list: ClientAttentionRow[] | null | undefined): ClientAttentionRow[] =>
    readArray(list).map((row) => ({ ...row, orders: readArray(row.orders) }))
  return {
    ...data,
    monthlyBuckets: readArray(data.monthlyBuckets),
    deliveryDistribution: readArray(data.deliveryDistribution),
    topClients: readArray(data.topClients),
    clientAttentionRows: rows(data.clientAttentionRows),
    internalAttentionRows: rows(data.internalAttentionRows),
    finance: data.finance
      ? {
          ...data.finance,
          monthlyProfit: readArray(data.finance.monthlyProfit),
          companyProfit: readArray(data.finance.companyProfit),
          itemProfit: {
            services: readArray(data.finance.itemProfit?.services),
            articles: readArray(data.finance.itemProfit?.articles),
          },
        }
      : null,
  }
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
  const send: FetchLike = async (input, init) => {
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

  // A successful GET whose JSON body breaks off mid-transfer is sent once more:
  // a GET is safe to repeat, and a second attempt over a fresh connection is
  // what an operator would otherwise do by hand with a refresh. Writes are never
  // repeated, and neither is a failed status — that answer is already final.
  const fetchImpl: FetchLike = async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method !== 'GET') return send(input, init)

    for (let attempt = 1; ; attempt += 1) {
      const response = await send(input, init)
      if (!isJSONResponse(response)) return response

      const buffered = await bufferJSONBody(response, attempt)
      requestDetails.set(buffered.response, { method, url: requestUrl(input) })
      if (!buffered.failure || !response.ok || attempt >= 2) {
        return buffered.response
      }
    }
  }

  return withOperationReporting({
    async getAppVersion() {
      return APP_VERSION
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
      // Too many failed attempts is an answer for the form to show, not a
      // backend fault.
      if (response.status === 429) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
        return {
          success: false,
          error: typeof payload?.error === 'string' ? payload.error : undefined,
        }
      }
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
      if (query.ids) params.set('ids', query.ids.join(','))
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
      return withModules(await readJSON<OrganizationSettings>(response))
    },

    async updateSettings(settings: Partial<Omit<OrganizationSettings, 'modules'>>) {
      // Modules are switched by Backoffice only; never send them from here even
      // if a caller spread a full settings object into the update.
      const { modules: _ignored, ...editable } = settings as Partial<OrganizationSettings>
      void _ignored
      const response = await fetchImpl(url('/settings'), jsonRequest('PUT', editable))
      return withModules(await readJSON<OrganizationSettings>(response))
    },

    async getPublicOrganization(slug: string) {
      const response = await fetchImpl(
        url(`/public/organizations/${encodeURIComponent(slug)}`),
        credentialedRequest(),
      )
      if (response.status === 404) return null
      return readJSON<PublicOrganization>(response)
    },

    getPublicOrganizationLogoUrl(slug: string, logoVersion: string) {
      return url(
        `/public/organizations/${encodeURIComponent(slug)}/logo?v=${encodeURIComponent(logoVersion)}`,
      )
    },

    async getLoginLogo() {
      const response = await fetchImpl(url('/settings/login-logo'), credentialedRequest())
      if (response.status === 404) return null
      if (!response.ok) {
        // Reuse readJSON's error path so the failure names the status.
        await readJSON<never>(response)
      }
      return response.blob()
    },

    async updateLoginLogo(upload: LoginLogoUpload) {
      const response = await fetchImpl(url('/settings/login-logo'), jsonRequest('PUT', upload))
      return readJSON<LoginLogoInfo>(response)
    },

    async deleteLoginLogo() {
      const response = await fetchImpl(
        url('/settings/login-logo'),
        credentialedRequest({ method: 'DELETE' }),
      )
      if (!response.ok) await readJSON<never>(response)
    },

    async platformLogin(credentials) {
      const response = await fetchImpl(url('/platform/auth/login'), jsonRequest('POST', credentials))
      return readJSON<PlatformLoginResponse>(response)
    },

    async platformLoginVerify(input: { challenge: string; code: string }) {
      const response = await fetchImpl(url('/platform/auth/login/verify'), jsonRequest('POST', input))
      return readJSON<PlatformLoginResponse>(response)
    },

    async setupPlatformTwoFactor() {
      const response = await fetchImpl(url('/platform/auth/2fa/setup'), credentialedRequest({ method: 'POST' }))
      return readJSON<PlatformTwoFactorSetup>(response)
    },

    async confirmPlatformTwoFactor(code: string) {
      const response = await fetchImpl(url('/platform/auth/2fa/confirm'), jsonRequest('POST', { code }))
      return readJSON<PlatformTwoFactorEnabled>(response)
    },

    async getPlatformAdmins() {
      const response = await fetchImpl(url('/platform/admins'), credentialedRequest())
      return readJSON<PlatformAdminSummary[]>(response)
    },

    async createPlatformAdmin(input: PlatformCreateAdminInput) {
      const response = await fetchImpl(url('/platform/admins'), jsonRequest('POST', input))
      return readJSON<PlatformAdminSummary>(response)
    },

    async setPlatformAdminDisabled(id: string, disabled: boolean) {
      const response = await fetchImpl(
        url(`/platform/admins/${encodeURIComponent(id)}/${disabled ? 'disable' : 'enable'}`),
        credentialedRequest({ method: 'POST' }),
      )
      return readJSON<PlatformAdminSummary>(response)
    },

    async getPlatformSession() {
      const response = await fetchImpl(url('/platform/auth/session'), credentialedRequest())
      return readJSON<PlatformLoginResponse>(response)
    },

    async platformLogout() {
      const response = await fetchImpl(
        url('/platform/auth/logout'),
        credentialedRequest({ method: 'POST' }),
      )
      await readJSON<{ success: boolean }>(response)
    },

    async changePlatformPassword(change: PlatformPasswordChange) {
      const response = await fetchImpl(url('/platform/auth/password'), jsonRequest('POST', change))
      return readJSON<PlatformLoginResponse>(response)
    },

    async getPlatformMetrics(days: PlatformRangeDays) {
      const response = await fetchImpl(url(`/platform/metrics?days=${days}`), credentialedRequest())
      return readJSON<PlatformMetrics>(response)
    },

    async getPlatformTenantUsers(slug: string) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/users`),
        credentialedRequest(),
      )
      return readJSON<PlatformTenantUsers>(response)
    },

    async platformImpersonate(slug: string, userId: string, reason: string) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/impersonate`),
        jsonRequest('POST', { userId, reason }),
      )
      return readJSON<PlatformImpersonationResponse>(response)
    },

    async getPlatformAudit({ limit, offset }: { limit: number; offset: number }) {
      const response = await fetchImpl(url(`/platform/audit?limit=${limit}&offset=${offset}`), credentialedRequest())
      return readJSON<PlatformAuditLog>(response)
    },

    async getPlatformTenants() {
      const response = await fetchImpl(url('/platform/tenants'), credentialedRequest())
      return readJSON<PlatformTenant[]>(response)
    },

    async createPlatformTenant(input: PlatformCreateTenantInput) {
      const response = await fetchImpl(url('/platform/tenants'), jsonRequest('POST', input))
      return readJSON<PlatformTenant>(response)
    },

    async updatePlatformTenant(slug: string, input: PlatformUpdateTenantInput) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}`),
        jsonRequest('PATCH', input),
      )
      return readJSON<PlatformTenant>(response)
    },

    async setPlatformTenantSuspended(slug: string, suspended: boolean) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/${suspended ? 'suspend' : 'reactivate'}`),
        credentialedRequest({ method: 'POST' }),
      )
      return readJSON<PlatformTenant>(response)
    },

    async setPlatformTenantModules(slug: string, modules: OrganizationModules) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/modules`),
        jsonRequest('PUT', {
          processes: modules.processes,
          stock: modules.stock,
          planning: modules.planning,
          attendance: modules.attendance,
          einvoicing: modules.einvoicing,
          edispatch: modules.edispatch,
        }),
      )
      return readJSON<PlatformTenant>(response)
    },

    async setPlatformTenantNotes(slug: string, notes: PlatformTenantNotesInput) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/notes`),
        jsonRequest('PUT', notes),
      )
      return readJSON<PlatformTenant>(response)
    },

    async platformExportTenant(slug: string): Promise<PlatformTenantExportFile> {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/export`),
        credentialedRequest(),
      )
      if (!response.ok) await readJSON<never>(response)
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
      const filename = match?.[1] ? decodeURIComponent(match[1]) : `iris-${slug}.json`
      return { blob: await response.blob(), filename }
    },

    async platformDeleteTenant(slug: string, confirmSlug: string) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}`),
        jsonRequest('DELETE', { confirmSlug }),
      )
      return readJSON<PlatformTenantDeletion>(response)
    },

    async resetPlatformUserPassword(slug: string, userId: string, password: string) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/users/${encodeURIComponent(userId)}/password`),
        jsonRequest('POST', { password }),
      )
      return readJSON<AuthenticatedUser>(response)
    },

    async getPlatformImpersonationActions(id: number) {
      const response = await fetchImpl(url(`/platform/impersonations/${id}/actions`), credentialedRequest())
      return readJSON<PlatformImpersonationAction[]>(response)
    },

    async getPlatformBackups() {
      const response = await fetchImpl(url('/platform/backups'), credentialedRequest())
      return readJSON<PlatformBackups>(response)
    },

    async createPlatformBackup() {
      const response = await fetchImpl(url('/platform/backups'), credentialedRequest({ method: 'POST' }))
      return readJSON<PlatformBackup>(response)
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

    async exportWorkOrdersCsv(query = {}) {
      const { columns, lang, ...filters } = query
      const params = new URLSearchParams(queryString(filters).slice(1))
      if (columns && columns.length > 0) params.set('columns', columns.join(','))
      if (lang) params.set('lang', lang)
      const search = params.toString()
      const response = await fetchImpl(
        url(`/work-orders/export.csv${search ? `?${search}` : ''}`),
        credentialedRequest(),
      )
      // Errors come back as the usual JSON envelope; readJSON raises them with
      // the status and request reference.
      if (!response.ok) await readJSON<never>(response)
      return response.blob()
    },

    async getWorkOrderOperators() {
      const response = await fetchImpl(url('/work-orders/operators'), credentialedRequest())
      return readArray(await readJSON<string[] | null>(response))
    },

    async getDashboard(query) {
      const response = await fetchImpl(url(`/dashboard${queryString(query)}`), credentialedRequest())
      return normalizeDashboardData(await readJSON<DashboardData>(response))
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

    async getStockLevels(query: StockLevelQuery = {}) {
      const params = new URLSearchParams()
      if (query.search) params.set('search', query.search)
      if (query.lowOnly) params.set('lowOnly', 'true')
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.offset !== undefined) params.set('offset', String(query.offset))
      const search = params.toString()
      const response = await fetchImpl(url(`/stock${search ? `?${search}` : ''}`), credentialedRequest())
      const result = await readJSON<StockLevelList>(response)
      return { items: readArray(result?.items), total: result?.total ?? 0 }
    },

    async getStockMovements(query: StockMovementQuery = {}) {
      const params = new URLSearchParams()
      if (query.catalogItemId) params.set('catalogItemId', query.catalogItemId)
      if (query.workOrderId) params.set('workOrderId', query.workOrderId)
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.offset !== undefined) params.set('offset', String(query.offset))
      const search = params.toString()
      const response = await fetchImpl(
        url(`/stock/movements${search ? `?${search}` : ''}`),
        credentialedRequest(),
      )
      const result = await readJSON<StockMovementList>(response)
      return { items: readArray(result?.items), total: result?.total ?? 0 }
    },

    async postStockReceipt(input: StockReceiptInput) {
      const response = await fetchImpl(url('/stock/receipts'), jsonRequest('POST', input))
      const result = await readJSON<StockPostingResult>(response)
      return { movements: readArray(result?.movements) }
    },

    async postStockCount(input: StockCountInput) {
      const response = await fetchImpl(url('/stock/counts'), jsonRequest('POST', input))
      const result = await readJSON<StockPostingResult>(response)
      return { movements: readArray(result?.movements) }
    },

    async getProcessTemplates() {
      const response = await fetchImpl(url('/process-templates'), credentialedRequest())
      return readArray(await readJSON<ProcessTemplate[]>(response)).map(normalizeTemplate)
    },

    async getProcessTemplate(id: string) {
      const response = await fetchImpl(
        url(`/process-templates/${encodeURIComponent(id)}`),
        credentialedRequest(),
      )
      if (response.status === 404) return null
      return normalizeTemplate(await readJSON<ProcessTemplate>(response))
    },

    async createProcessTemplate(input: ProcessTemplateInput) {
      const response = await fetchImpl(url('/process-templates'), jsonRequest('POST', input))
      return normalizeTemplate(await readJSON<ProcessTemplate>(response))
    },

    async updateProcessTemplate(id: string, input: ProcessTemplateInput) {
      const response = await fetchImpl(
        url(`/process-templates/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return normalizeTemplate(await readJSON<ProcessTemplate>(response))
    },

    async deleteProcessTemplate(id: string) {
      const response = await fetchImpl(
        url(`/process-templates/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async getWorkOrderProcess(workOrderId: string) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(workOrderId)}/process`),
        credentialedRequest(),
      )
      if (response.status === 404) return null
      return normalizeProcess(await readJSON<WorkOrderProcess>(response))
    },

    async applyProcessTemplate(workOrderId: string, templateId: string) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(workOrderId)}/process`),
        jsonRequest('POST', { templateId }),
      )
      return normalizeProcess(await readJSON<WorkOrderProcess>(response))
    },

    async updateWorkOrderProcess(workOrderId: string, input: WorkOrderProcessInput) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(workOrderId)}/process`),
        jsonRequest('PUT', input),
      )
      return normalizeProcess(await readJSON<WorkOrderProcess>(response))
    },

    async deleteWorkOrderProcess(workOrderId: string) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(workOrderId)}/process`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async getPlatformProcessTemplates(slug: string) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/process-templates`),
        credentialedRequest(),
      )
      return readArray(await readJSON<ProcessTemplate[]>(response)).map(normalizeTemplate)
    },

    async createPlatformProcessTemplate(slug: string, input: ProcessTemplateInput) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/process-templates`),
        jsonRequest('POST', input),
      )
      return normalizeTemplate(await readJSON<ProcessTemplate>(response))
    },

    async updatePlatformProcessTemplate(slug: string, id: string, input: ProcessTemplateInput) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/process-templates/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return normalizeTemplate(await readJSON<ProcessTemplate>(response))
    },

    async deletePlatformProcessTemplate(slug: string, id: string) {
      const response = await fetchImpl(
        url(`/platform/tenants/${encodeURIComponent(slug)}/process-templates/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async listMachineTypes() {
      const response = await fetchImpl(url('/machine-types'), credentialedRequest())
      return readArray(await readJSON<MachineType[]>(response))
    },

    async createMachineType(input: MachineTypeInput) {
      const response = await fetchImpl(url('/machine-types'), jsonRequest('POST', input))
      return readJSON<MachineType>(response)
    },

    async updateMachineType(id: string, input: MachineTypeInput) {
      const response = await fetchImpl(
        url(`/machine-types/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<MachineType>(response)
    },

    async deleteMachineType(id: string) {
      const response = await fetchImpl(
        url(`/machine-types/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async listMachines() {
      const response = await fetchImpl(url('/machines'), credentialedRequest())
      return readArray(await readJSON<Machine[]>(response))
    },

    async createMachine(input: MachineInput) {
      const response = await fetchImpl(url('/machines'), jsonRequest('POST', input))
      return readJSON<Machine>(response)
    },

    async updateMachine(id: string, input: MachineInput) {
      const response = await fetchImpl(
        url(`/machines/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<Machine>(response)
    },

    async deleteMachine(id: string) {
      const response = await fetchImpl(
        url(`/machines/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async listMachineDowntimes(machineId: string) {
      const response = await fetchImpl(
        url(`/machines/${encodeURIComponent(machineId)}/downtimes`),
        credentialedRequest(),
      )
      return readArray(await readJSON<MachineDowntime[]>(response))
    },

    async createMachineDowntime(machineId: string, input: MachineDowntimeInput) {
      const response = await fetchImpl(
        url(`/machines/${encodeURIComponent(machineId)}/downtimes`),
        jsonRequest('POST', input),
      )
      return readJSON<MachineDowntime>(response)
    },

    async deleteMachineDowntime(machineId: string, downtimeId: string) {
      const response = await fetchImpl(
        url(`/machines/${encodeURIComponent(machineId)}/downtimes/${encodeURIComponent(downtimeId)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async listQualifications() {
      const response = await fetchImpl(url('/planning/qualifications'), credentialedRequest())
      return readArray(await readJSON<WorkerQualifications[]>(response)).map((entry) => ({
        ...entry,
        machineTypeIds: readArray(entry.machineTypeIds),
      }))
    },

    async setQualifications(userId: string, input: WorkerQualificationsInput) {
      const response = await fetchImpl(
        url(`/planning/qualifications/${encodeURIComponent(userId)}`),
        jsonRequest('PUT', input),
      )
      const result = await readJSON<WorkerQualifications>(response)
      return { ...result, machineTypeIds: readArray(result?.machineTypeIds) }
    },

    async listAttendance(date: string) {
      const response = await fetchImpl(
        url(`/attendance?${new URLSearchParams({ date })}`),
        credentialedRequest(),
      )
      return readArray(await readJSON<AttendanceEntry[]>(response))
    },

    async setAttendance(userId: string, input: AttendanceInput) {
      const response = await fetchImpl(
        url(`/attendance/${encodeURIComponent(userId)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<AttendanceEntry>(response)
    },

    async getWorkingHours() {
      const response = await fetchImpl(url('/planning/working-hours'), credentialedRequest())
      return normalizeWorkingHours(await readJSON<WorkingHours>(response))
    },

    async setWorkingHours(input: WorkingHours) {
      const response = await fetchImpl(url('/planning/working-hours'), jsonRequest('PUT', input))
      return normalizeWorkingHours(await readJSON<WorkingHours>(response))
    },

    async getPlanDay(date: string) {
      const response = await fetchImpl(
        url(`/planning/plan?${new URLSearchParams({ date })}`),
        credentialedRequest(),
      )
      const day = await readJSON<PlanDay>(response)
      return {
        ...day,
        draft: day.draft ? normalizePlan(day.draft) : null,
        published: day.published ? normalizePlan(day.published) : null,
        drift: day.drift ? { ...day.drift, reasons: readArray(day.drift.reasons) } : null,
      }
    },

    async getPlanHorizon(date: string) {
      const response = await fetchImpl(
        url(`/planning/plan/horizon?${new URLSearchParams({ date })}`),
        credentialedRequest(),
      )
      const horizon = await readJSON<PlanDayHorizon>(response)
      return {
        ...horizon,
        draft: horizon.draft ? normalizePlanHorizon(horizon.draft) : null,
        published: horizon.published ? normalizePlanHorizon(horizon.published) : null,
      }
    },

    async generatePlan(input: PlanGenerateInput) {
      const response = await fetchImpl(url('/planning/plan/generate'), jsonRequest('POST', input))
      return normalizePlan(await readJSON<ProductionPlan>(response))
    },

    async updatePlanDraft(input: PlanDraftInput) {
      const response = await fetchImpl(url('/planning/plan/draft'), jsonRequest('PUT', input))
      return normalizePlan(await readJSON<ProductionPlan>(response))
    },

    async deletePlanDraft(date: string) {
      const response = await fetchImpl(
        url(`/planning/plan/draft?${new URLSearchParams({ date })}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },

    async publishPlan(input: PlanPublishInput) {
      const response = await fetchImpl(url('/planning/plan/publish'), jsonRequest('POST', input))
      return normalizePlan(await readJSON<ProductionPlan>(response))
    },

    async getMyQueue(date?: string) {
      const search = date ? `?${new URLSearchParams({ date })}` : ''
      const response = await fetchImpl(url(`/planning/my-queue${search}`), credentialedRequest())
      const queue = await readJSON<MyQueue>(response)
      return { ...queue, items: readArray(queue?.items).map(normalizeAssignment) }
    },

    async getPlanningForecast() {
      const response = await fetchImpl(url('/planning/forecast'), credentialedRequest())
      return readArray(await readJSON<OrderForecast[]>(response))
    },

    async getMaterialNeeds(query?: MaterialNeedsQuery) {
      const params = new URLSearchParams()
      if (query?.from) params.set('from', query.from)
      if (query?.to) params.set('to', query.to)
      const search = params.toString() ? `?${params}` : ''
      const response = await fetchImpl(url(`/planning/material-needs${search}`), credentialedRequest())
      const needs = await readJSON<MaterialNeeds>(response)
      return {
        ...needs,
        weeks: readArray(needs?.weeks),
        items: readArray<MaterialNeedsItem>(needs?.items).map((item) => ({
          ...item,
          weeks: readArray(item.weeks),
          cumulative: readArray(item.cumulative),
        })),
      }
    },

    async getPlanningLoad(query: WorkstationLoadQuery = {}) {
      const params = new URLSearchParams()
      if (query.from) params.set('from', query.from)
      if (query.to) params.set('to', query.to)
      if (query.plan) params.set('plan', query.plan)
      const search = params.size > 0 ? `?${params}` : ''
      const response = await fetchImpl(url(`/planning/load${search}`), credentialedRequest())
      const load = await readJSON<WorkstationLoad>(response)
      const days = (list: WorkstationLoadDay[] | null | undefined): WorkstationLoadDay[] =>
        readArray(list).map((day) => ({ ...day, blocks: readArray(day.blocks) }))
      return {
        ...load,
        days: readArray(load.days),
        machineTypes: readArray(load.machineTypes).map((type) => ({
          ...type,
          days: readArray(type.days),
          units: readArray(type.units).map((unit) => ({ ...unit, days: days(unit.days) })),
        })),
        people: readArray(load.people).map((person) => ({ ...person, days: days(person.days) })),
      }
    },

    async getPlanningCalibration(query: PlanningCalibrationQuery = {}) {
      const params = new URLSearchParams()
      if (query.from) params.set('from', query.from)
      if (query.to) params.set('to', query.to)
      const search = params.toString() ? `?${params}` : ''
      const response = await fetchImpl(url(`/planning/calibration${search}`), credentialedRequest())
      const report = await readJSON<PlanningCalibration>(response)
      return { ...report, steps: readArray(report?.steps) }
    },

    async getAnnouncements() {
      const response = await fetchImpl(url('/announcements'), credentialedRequest())
      return readArray(await readJSON<Announcement[]>(response))
    },

    async getPublicAnnouncements(slug: string) {
      const response = await fetchImpl(
        url(`/public/organizations/${encodeURIComponent(slug)}/announcements`),
        credentialedRequest(),
      )
      return readArray(await readJSON<Announcement[]>(response))
    },

    async getPlatformAnnouncements() {
      const response = await fetchImpl(url('/platform/announcements'), credentialedRequest())
      return readArray(await readJSON<PlatformAnnouncement[]>(response))
    },

    async createPlatformAnnouncement(input: PlatformAnnouncementInput) {
      const response = await fetchImpl(url('/platform/announcements'), jsonRequest('POST', input))
      return readJSON<PlatformAnnouncement>(response)
    },

    async updatePlatformAnnouncement(id: string, input: PlatformAnnouncementInput) {
      const response = await fetchImpl(
        url(`/platform/announcements/${encodeURIComponent(id)}`),
        jsonRequest('PUT', input),
      )
      return readJSON<PlatformAnnouncement>(response)
    },

    async endPlatformAnnouncement(id: string) {
      const response = await fetchImpl(
        url(`/platform/announcements/${encodeURIComponent(id)}/end`),
        credentialedRequest({ method: 'POST' }),
      )
      return readJSON<PlatformAnnouncement>(response)
    },

    async deletePlatformAnnouncement(id: string) {
      const response = await fetchImpl(
        url(`/platform/announcements/${encodeURIComponent(id)}`),
        credentialedRequest({ method: 'DELETE' }),
      )
      await readNoContent(response)
    },
  })
}
