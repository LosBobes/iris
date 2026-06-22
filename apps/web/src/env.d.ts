/// <reference types="vite/client" />

import type {
  Customer,
  CreateWorkOrderInput,
  EnumValue,
  EnumValueInput,
  Location,
  PublicWorkOrderStatus,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListQuery,
  WorkOrderListResult,
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
      getCurrentSession: () => Promise<LoginResponse>
      logout: () => Promise<void>
      getCustomers: () => Promise<Customer[]>
      upsertCustomer: (customer: Customer) => Promise<Customer>
      deleteCustomer: (id: string) => Promise<{ success: boolean }>
      getLocations: () => Promise<Location[]>
      upsertLocation: (location: Location) => Promise<Location>
      deleteLocation: (id: string) => Promise<{ success: boolean }>
      getEnumValues: () => Promise<EnumValue[]>
      createEnumValue: (input: EnumValueInput) => Promise<EnumValue>
      updateEnumValue: (id: string, input: EnumValueInput) => Promise<EnumValue>
      deleteEnumValue: (id: string) => Promise<{ success: boolean }>
      getWorkOrders: (query?: WorkOrderListQuery) => Promise<WorkOrderListResult>
      getWorkOrderOperators: () => Promise<string[]>
      getWorkOrderById: (id: string) => Promise<WorkOrder | null>
      createWorkOrder: (input: CreateWorkOrderInput) => Promise<WorkOrder>
      updateWorkOrder: (
        id: string,
        changes: UpdateWorkOrderInput,
      ) => Promise<WorkOrder | null>
      deleteWorkOrder: (id: string) => Promise<DeleteWorkOrderResponse>
      getPublicWorkOrderStatus: (token: string) => Promise<PublicWorkOrderStatus | null>
      getPublicTrackingUrl: (token: string) => string
      getWorkOrderReportUrl: (id: string) => string
    }
  }
}

export {}
