import type {
  Customer,
  CreateWorkOrderInput,
  Location,
  PublicWorkOrderStatus,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListQuery,
  WorkOrderListResult,
} from '@/types/work-order'

type FetchLike = typeof fetch

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
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as { error?: string }).error
        : undefined
    throw new Error(message ?? `HTTP ${response.status}`)
  }

  if (payload === undefined) {
    throw new Error('Neispravan odgovor servera.')
  }

  return payload as T
}

function readArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeWorkOrderListResult(value: WorkOrderListResult): WorkOrderListResult {
  return {
    ...value,
    items: readArray(value.items),
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

export function createHttpApi(baseUrl: string, fetchImpl: FetchLike = fetch): Window['api'] {
  const url = (path: string): string => joinUrl(baseUrl, path)

  return {
    async getAppVersion() {
      return '0.1.0-dev'
    },

    async getBackendStatus() {
      const unavailable = {
        ready: false as const,
        message: 'Backend servis nije dostupan. Pokrenite iris-api i pokušajte ponovo.',
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

    async getCustomers() {
      const response = await fetchImpl(url('/customers'), credentialedRequest())
      return readArray(await readJSON<Customer[] | null>(response))
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

    async getLocations() {
      const response = await fetchImpl(url('/locations'), credentialedRequest())
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
      return readJSON<WorkOrder>(response)
    },

    async createWorkOrder(input: CreateWorkOrderInput) {
      const response = await fetchImpl(url('/work-orders'), jsonRequest('POST', input))
      return readJSON<WorkOrder>(response)
    },

    async updateWorkOrder(id: string, changes: UpdateWorkOrderInput) {
      const response = await fetchImpl(
        url(`/work-orders/${encodeURIComponent(id)}`),
        jsonRequest('PATCH', changes),
      )
      if (response.status === 404) return null
      return readJSON<WorkOrder>(response)
    },

    async deleteWorkOrder(id: string) {
      const response = await fetchImpl(url(`/work-orders/${encodeURIComponent(id)}`), credentialedRequest({
        method: 'DELETE',
      }))
      return readJSON<DeleteWorkOrderResponse>(response)
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
  }
}
