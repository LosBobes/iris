import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
} from '../../../model/work-order'
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemListResult,
  CatalogItemQuery,
} from '../../../model/catalog'
import type { User } from '../../../model/user'
import type { OrganizationSettings } from '../../../model/settings'
import { getDesktopConfig } from './runtime-config'

export interface BackendStatus {
  ready: boolean
  message?: string
}

export interface LoginResponse {
  success: boolean
  error?: string
  user?: User
}

export interface DeleteWorkOrderResponse {
  success: boolean
  message?: string
}

type FetchFn = typeof fetch

type IrisApiErrorCode = 'not-configured' | 'network' | 'http' | 'bad-response'

interface IrisApiClientOptions {
  baseUrl: string
  fetchFn?: FetchFn
}

export interface IrisApiClient {
  getBackendStatus: () => Promise<BackendStatus>
  login: (credentials: {
    orgSlug: string
    username: string
    password: string
  }) => Promise<LoginResponse>
  getWorkOrders: () => Promise<WorkOrder[]>
  getWorkOrderOperators: () => Promise<string[]>
  getWorkOrderById: (id: string) => Promise<WorkOrder | null>
  createWorkOrder: (input: CreateWorkOrderInput) => Promise<WorkOrder>
  updateWorkOrder: (
    id: string,
    changes: UpdateWorkOrderInput,
  ) => Promise<WorkOrder | null>
  deleteWorkOrder: (id: string) => Promise<DeleteWorkOrderResponse>
  getCatalogItems: (query?: CatalogItemQuery) => Promise<CatalogItemListResult>
  createCatalogItem: (input: CatalogItemInput) => Promise<CatalogItem>
  updateCatalogItem: (id: string, input: CatalogItemInput) => Promise<CatalogItem>
  deleteCatalogItem: (id: string) => Promise<{ success: boolean }>
  getSettings: () => Promise<OrganizationSettings>
}

const BACKEND_ERROR_MESSAGES = {
  notConfigured:
    'Backend servis nije podešen. Proverite konfiguraciju aplikacije (IRIS_API_BASE_URL).',
  unreachable:
    'Backend servis nije dostupan. Proverite da li je Iris API pokrenut.',
  badResponse: 'Backend servis je vratio neispravan odgovor.',
  invalidData: 'Prosleđeni podaci nisu ispravni.',
  notFound: 'Traženi resurs nije pronađen.',
  server: 'Došlo je do greške na backend servisu.',
  generic: 'Došlo je do greške u komunikaciji sa backend servisom.',
} as const

export class IrisApiError extends Error {
  readonly code: IrisApiErrorCode
  readonly status?: number
  readonly userMessage: string

  constructor(userMessage: string, code: IrisApiErrorCode, status?: number) {
    super(userMessage)
    this.name = 'IrisApiError'
    this.code = code
    this.status = status
    this.userMessage = userMessage
  }
}

function createHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')

  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
}

function createNotConfiguredError(): IrisApiError {
  return new IrisApiError(BACKEND_ERROR_MESSAGES.notConfigured, 'not-configured')
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw createNotConfiguredError()
  }

  return trimmed.replace(/\/+$/, '')
}

function getErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  if ('error' in payload && typeof payload.error === 'string') {
    return payload.error
  }

  if ('message' in payload && typeof payload.message === 'string') {
    return payload.message
  }

  return undefined
}

function getHttpErrorMessage(status: number, payload: unknown): string {
  const payloadMessage = getErrorMessage(payload)
  if (payloadMessage) {
    return payloadMessage
  }

  if (status === 400 || status === 422) {
    return BACKEND_ERROR_MESSAGES.invalidData
  }

  if (status === 404) {
    return BACKEND_ERROR_MESSAGES.notFound
  }

  if (status >= 500) {
    return BACKEND_ERROR_MESSAGES.server
  }

  return BACKEND_ERROR_MESSAGES.generic
}

async function readJsonPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new IrisApiError(
      BACKEND_ERROR_MESSAGES.badResponse,
      'bad-response',
      response.status,
    )
  }
}

export function mapIrisApiErrorToUserMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof IrisApiError ? error.userMessage : fallback
}

export function createIrisApiClient({
  baseUrl,
  fetchFn = fetch,
}: IrisApiClientOptions): IrisApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  async function performRequest(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetchFn(`${normalizedBaseUrl}${path}`, {
        ...init,
        headers: createHeaders(init),
      })
    } catch {
      throw new IrisApiError(BACKEND_ERROR_MESSAGES.unreachable, 'network')
    }
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await performRequest(path, init)
    const payload = await readJsonPayload(response)

    if (!response.ok) {
      throw new IrisApiError(
        getHttpErrorMessage(response.status, payload),
        'http',
        response.status,
      )
    }

    return payload as T
  }

  async function requestJsonOrNull<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T | null> {
    const response = await performRequest(path, init)
    const payload = await readJsonPayload(response)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new IrisApiError(
        getHttpErrorMessage(response.status, payload),
        'http',
        response.status,
      )
    }

    return payload as T
  }

  return {
    async getBackendStatus(): Promise<BackendStatus> {
      try {
        const payload = await requestJson<{ status?: string }>('/healthz')
        if (payload?.status !== 'ok') {
          throw new IrisApiError(BACKEND_ERROR_MESSAGES.badResponse, 'bad-response')
        }

        return { ready: true }
      } catch (error) {
        return {
          ready: false,
          message: mapIrisApiErrorToUserMessage(error, BACKEND_ERROR_MESSAGES.generic),
        }
      }
    },

    async login(credentials): Promise<LoginResponse> {
      return requestJson<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
    },

    async getWorkOrders(): Promise<WorkOrder[]> {
      return requestJson<WorkOrder[]>('/work-orders')
    },

    async getWorkOrderOperators(): Promise<string[]> {
      return requestJson<string[]>('/work-orders/operators')
    },

    async getWorkOrderById(id: string): Promise<WorkOrder | null> {
      return requestJsonOrNull<WorkOrder>(`/work-orders/${encodeURIComponent(id)}`)
    },

    async createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
      return requestJson<WorkOrder>('/work-orders', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async updateWorkOrder(
      id: string,
      changes: UpdateWorkOrderInput,
    ): Promise<WorkOrder | null> {
      return requestJsonOrNull<WorkOrder>(`/work-orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })
    },

    async deleteWorkOrder(id: string): Promise<DeleteWorkOrderResponse> {
      return requestJson<DeleteWorkOrderResponse>(`/work-orders/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },

    async getCatalogItems(query: CatalogItemQuery = {}): Promise<CatalogItemListResult> {
      const params = new URLSearchParams()
      if (query.kind) params.set('kind', query.kind)
      if (query.q) params.set('q', query.q)
      if (query.active) params.set('active', 'true')
      if (query.limit !== undefined) params.set('limit', String(query.limit))
      if (query.offset !== undefined) params.set('offset', String(query.offset))
      const search = params.toString()
      return requestJson<CatalogItemListResult>(`/catalog-items${search ? `?${search}` : ''}`)
    },

    async createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
      return requestJson<CatalogItem>('/catalog-items', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async updateCatalogItem(id: string, input: CatalogItemInput): Promise<CatalogItem> {
      return requestJson<CatalogItem>(`/catalog-items/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
    },

    async deleteCatalogItem(id: string): Promise<{ success: boolean }> {
      return requestJson<{ success: boolean }>(`/catalog-items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },

    async getSettings(): Promise<OrganizationSettings> {
      return requestJson<OrganizationSettings>('/settings')
    },
  }
}

export function createConfiguredIrisApiClient(fetchFn: FetchFn = fetch): IrisApiClient {
  const baseUrl = getDesktopConfig().api.baseUrl
  if (!baseUrl) {
    throw createNotConfiguredError()
  }

  return createIrisApiClient({ baseUrl, fetchFn })
}

export async function getConfiguredBackendStatus(
  fetchFn: FetchFn = fetch,
): Promise<BackendStatus> {
  const baseUrl = getDesktopConfig().api.baseUrl
  if (!baseUrl) {
    return {
      ready: false,
      message: BACKEND_ERROR_MESSAGES.notConfigured,
    }
  }

  return createIrisApiClient({ baseUrl, fetchFn }).getBackendStatus()
}