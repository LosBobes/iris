import type {
  Customer,
  CreateWorkOrderInput,
  Location,
  PublicWorkOrderStatus,
  UpdateWorkOrderInput,
  WorkOrder,
} from '@/types/work-order'

type FetchLike = typeof fetch

async function readJSON<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? payload.error
        : undefined
    throw new Error(message ?? `HTTP ${response.status}`)
  }

  return payload as T
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function createHttpApi(baseUrl: string, fetchImpl: FetchLike = fetch): Window['api'] {
  const url = (path: string): string => joinUrl(baseUrl, path)

  return {
    async getAppVersion() {
      return '0.1.0-dev'
    },

    async getBackendStatus() {
      try {
        await fetchImpl(url('/healthz'))
        return { ready: true }
      } catch {
        return {
          ready: false,
          message: 'Backend servis nije dostupan. Pokrenite iris-api i pokušajte ponovo.',
        }
      }
    },

    async login(credentials) {
      const response = await fetchImpl(url('/auth/login'), jsonRequest('POST', credentials))
      return readJSON<LoginResponse>(response)
    },

    async getCustomers() {
      const response = await fetchImpl(url('/customers'))
      return readJSON<Customer[]>(response)
    },

    async getLocations() {
      const response = await fetchImpl(url('/locations'))
      return readJSON<Location[]>(response)
    },

    async getWorkOrders() {
      const response = await fetchImpl(url('/work-orders'))
      return readJSON<WorkOrder[]>(response)
    },

    async getWorkOrderOperators() {
      const response = await fetchImpl(url('/work-orders/operators'))
      return readJSON<string[]>(response)
    },

    async getWorkOrderById(id) {
      const response = await fetchImpl(url(`/work-orders/${encodeURIComponent(id)}`))
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
      const response = await fetchImpl(url(`/work-orders/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      })
      return readJSON<DeleteWorkOrderResponse>(response)
    },

    async getPublicWorkOrderStatus(token: string) {
      const response = await fetchImpl(
        url(`/public/work-orders/${encodeURIComponent(token)}`),
      )
      if (response.status === 404) return null
      return readJSON<PublicWorkOrderStatus>(response)
    },

    getPublicTrackingUrl(token: string) {
      return url(`/public/work-orders/${encodeURIComponent(token)}`)
    },

    getWorkOrderReportUrl(id: string) {
      return url(`/work-orders/${encodeURIComponent(id)}/report`)
    },
  }
}
