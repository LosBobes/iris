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
  CustomerListQuery,
  CustomerListResult,
  WorkOrderListQuery,
  WorkOrderListResult,
} from '@/types/work-order'
import type {
  CatalogItem,
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
      getCustomers: (query?: CustomerListQuery) => Promise<CustomerListResult>
      getCustomerById: (id: string) => Promise<Customer | null>
      upsertCustomer: (customer: Customer) => Promise<Customer>
      deleteCustomer: (id: string) => Promise<{ success: boolean }>
      getLocations: () => Promise<Location[]>
      upsertLocation: (location: Location) => Promise<Location>
      deleteLocation: (id: string) => Promise<{ success: boolean }>
      getEnumValues: () => Promise<EnumValue[]>
      createEnumValue: (input: EnumValueInput) => Promise<EnumValue>
      updateEnumValue: (id: string, input: EnumValueInput) => Promise<EnumValue>
      deleteEnumValue: (id: string) => Promise<{ success: boolean }>
      getCatalogItems: (query?: CatalogItemQuery) => Promise<CatalogItemListResult>
      getCatalogItemById: (id: string) => Promise<CatalogItem | null>
      createCatalogItem: (input: CatalogItemInput) => Promise<CatalogItem>
      updateCatalogItem: (id: string, input: CatalogItemInput) => Promise<CatalogItem>
      deleteCatalogItem: (id: string) => Promise<{ success: boolean }>
      getSettings: () => Promise<OrganizationSettings>
      updateSettings: (settings: Partial<OrganizationSettings>) => Promise<OrganizationSettings>
      listUsers: () => Promise<ManagedUser[]>
      createUser: (input: CreateUserInput) => Promise<ManagedUser>
      updateUser: (id: string, input: UpdateUserInput) => Promise<ManagedUser>
      deleteUser: (id: string) => Promise<{ success: boolean }>
      getWorkOrders: (query?: WorkOrderListQuery) => Promise<WorkOrderListResult>
      getWorkOrderOperators: () => Promise<string[]>
      getWorkOrderById: (id: string) => Promise<WorkOrder | null>
      createWorkOrder: (input: CreateWorkOrderInput) => Promise<WorkOrder>
      updateWorkOrder: (
        id: string,
        changes: UpdateWorkOrderInput,
      ) => Promise<WorkOrder | null>
      deleteWorkOrder: (id: string) => Promise<DeleteWorkOrderResponse>
      getWorkOrderPreviewHtml: (order: WorkOrder) => Promise<string>
      getPublicWorkOrderStatus: (token: string) => Promise<PublicWorkOrderStatus | null>
      getPublicTrackingUrl: (token: string) => string
      getWorkOrderReportUrl: (id: string) => string
    }
  }
}

export {}
