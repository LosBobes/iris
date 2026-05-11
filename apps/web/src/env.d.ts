/// <reference types="vite/client" />

import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
} from '@/types/work-order'

declare global {
  interface AuthenticatedUser {
    id: string
    username: string
    role: 'admin' | 'user'
  }

  interface LoginResponse {
    success: boolean
    error?: string
    user?: AuthenticatedUser
  }

  interface DeleteWorkOrderResponse {
    success: boolean
    message?: string
  }

  interface BackendStatus {
    ready: boolean
    message?: string
  }

  interface Window {
    api: {
      getAppVersion: () => Promise<string>
      getBackendStatus: () => Promise<BackendStatus>
      login: (credentials: {
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
    }
  }
}

export {}
