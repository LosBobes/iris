/// <reference types="vite/client" />

import type {
  Customer,
  CreateWorkOrderInput,
  EditLockResult,
  EnumValue,
  EnumValueInput,
  Location,
  PublicWorkOrderStatus,
  ReservedOrderNumber,
  UpdateWorkOrderInput,
  WorkOrder,
  CustomerListQuery,
  CustomerListResult,
  WorkOrderListQuery,
  WorkOrderListResult,
} from '@/types/work-order'
import type { DashboardData, DashboardQuery } from '@/types/dashboard'
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
  OrganizationSettings,
  PublicOrganization,
} from '@/types/settings'
import type {
  PlatformLoginResponse,
  PlatformMetrics,
  PlatformPasswordChange,
  PlatformRangeDays,
  PlatformTenantUsers,
  PlatformImpersonationResponse,
  PlatformImpersonationLog,
  PlatformImpersonationAction,
} from '@/types/platform'
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
    /** Set only on a session a Backoffice superadmin opened as this user: their username. */
    impersonatedBy?: string
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
        orgSlug: string
        username: string
        password: string
      }) => Promise<LoginResponse>
      getCurrentSession: () => Promise<LoginResponse>
      logout: () => Promise<void>
      getCustomers: (query?: CustomerListQuery) => Promise<CustomerListResult>
      getCustomerById: (id: string) => Promise<Customer | null>
      upsertCustomer: (customer: Customer) => Promise<Customer>
      deleteCustomer: (id: string) => Promise<{ success: boolean }>
      getLocations: (customerId?: string) => Promise<Location[]>
      upsertLocation: (location: Location) => Promise<Location>
      deleteLocation: (id: string) => Promise<{ success: boolean }>
      getEnumValues: () => Promise<EnumValue[]>
      createEnumValue: (input: EnumValueInput) => Promise<EnumValue>
      updateEnumValue: (id: string, input: EnumValueInput) => Promise<EnumValue>
      deleteEnumValue: (id: string) => Promise<{ success: boolean }>
      getCatalogItems: (query?: CatalogItemQuery) => Promise<CatalogItemListResult>
      getCatalogItemById: (id: string) => Promise<CatalogItem | null>
      getCatalogItemCostHistory: (id: string) => Promise<CatalogItemCost[]>
      createCatalogItem: (input: CatalogItemInput) => Promise<CatalogItem>
      updateCatalogItem: (id: string, input: CatalogItemInput) => Promise<CatalogItem>
      deleteCatalogItem: (id: string) => Promise<{ success: boolean }>
      previewCatalogCleanup: (filter: CatalogCleanupFilter) => Promise<CatalogItemListResult>
      cleanupCatalogItems: (filter: CatalogCleanupFilter) => Promise<{ deleted: number }>
      getSettings: () => Promise<OrganizationSettings>
      updateSettings: (settings: Partial<OrganizationSettings>) => Promise<OrganizationSettings>
      /** Resolves an organization slug for the first sign-in step; null when unknown. */
      getPublicOrganization: (slug: string) => Promise<PublicOrganization | null>
      /** URL of an organization's sign-in logo, versioned to bust caches. */
      getPublicOrganizationLogoUrl: (slug: string, logoVersion: string) => string
      /** The signed-in organization's logo for the Settings preview; null when unset. */
      getLoginLogo: () => Promise<Blob | null>
      updateLoginLogo: (upload: LoginLogoUpload) => Promise<LoginLogoInfo>
      deleteLoginLogo: () => Promise<void>
      /** Backoffice (superadmin accounts and cookie, separate from organization users; see iris-api platform.go). */
      platformLogin: (credentials: { username: string; password: string }) => Promise<PlatformLoginResponse>
      getPlatformSession: () => Promise<PlatformLoginResponse>
      platformLogout: () => Promise<void>
      changePlatformPassword: (change: PlatformPasswordChange) => Promise<PlatformLoginResponse>
      getPlatformMetrics: (days: PlatformRangeDays) => Promise<PlatformMetrics>
      getPlatformTenantUsers: (slug: string) => Promise<PlatformTenantUsers>
      /** Replaces this browser's organization session with one as the chosen user. */
      platformImpersonate: (slug: string, userId: string) => Promise<PlatformImpersonationResponse>
      getPlatformImpersonations: (query: { limit: number; offset: number }) => Promise<PlatformImpersonationLog>
      getPlatformImpersonationActions: (id: number) => Promise<PlatformImpersonationAction[]>
      listUsers: () => Promise<ManagedUser[]>
      createUser: (input: CreateUserInput) => Promise<ManagedUser>
      updateUser: (id: string, input: UpdateUserInput) => Promise<ManagedUser>
      deleteUser: (id: string) => Promise<{ success: boolean }>
      getWorkOrders: (query?: WorkOrderListQuery) => Promise<WorkOrderListResult>
      getWorkOrderOperators: () => Promise<string[]>
      getDashboard: (query?: DashboardQuery) => Promise<DashboardData>
      getWorkOrderById: (id: string) => Promise<WorkOrder | null>
      reserveWorkOrderNumber: () => Promise<ReservedOrderNumber>
      releaseWorkOrderNumber: (orderNumber: string) => Promise<void>
      acquireWorkOrderEditLock: (id: string) => Promise<EditLockResult>
      releaseWorkOrderEditLock: (id: string) => Promise<void>
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
