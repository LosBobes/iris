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
  WorkOrderCsvExportQuery,
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
  OrganizationModules,
  OrganizationSettings,
  PublicOrganization,
} from '@/types/settings'
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
import type {
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
  MachineInput,
  MachineType,
  MachineTypeInput,
  MyQueue,
  OrderForecast,
  PlanDay,
  PlanDraftInput,
  PlanGenerateInput,
  PlanPublishInput,
  ProductionPlan,
  WorkerQualifications,
  WorkerQualificationsInput,
  WorkingHours,
} from '@/types/planning'
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
        /** Stay signed in on this device (persistent cookie, up to 30 days). */
        remember?: boolean
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
      /** `modules` is read-only for tenants (Backoffice switches it) and is never sent. */
      updateSettings: (settings: Partial<Omit<OrganizationSettings, 'modules'>>) => Promise<OrganizationSettings>
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
      /** Second sign-in step for an account with two-factor sign-in: a TOTP or recovery code. */
      platformLoginVerify: (input: { challenge: string; code: string }) => Promise<PlatformLoginResponse>
      getPlatformSession: () => Promise<PlatformLoginResponse>
      /** Starts (or restarts) the signed-in superadmin's TOTP enrollment. */
      setupPlatformTwoFactor: () => Promise<PlatformTwoFactorSetup>
      /** Confirms the enrollment with a code; returns the one-time recovery codes. */
      confirmPlatformTwoFactor: (code: string) => Promise<PlatformTwoFactorEnabled>
      getPlatformAdmins: () => Promise<PlatformAdminSummary[]>
      /** Adds a superadmin with a temporary password (changed at first sign-in). */
      createPlatformAdmin: (input: PlatformCreateAdminInput) => Promise<PlatformAdminSummary>
      /** Disables (true) or re-enables (false) a superadmin. */
      setPlatformAdminDisabled: (id: string, disabled: boolean) => Promise<PlatformAdminSummary>
      platformLogout: () => Promise<void>
      changePlatformPassword: (change: PlatformPasswordChange) => Promise<PlatformLoginResponse>
      getPlatformMetrics: (days: PlatformRangeDays) => Promise<PlatformMetrics>
      getPlatformTenantUsers: (slug: string) => Promise<PlatformTenantUsers>
      /** Replaces this browser's organization session with one as the chosen user. */
      platformImpersonate: (slug: string, userId: string, reason: string) => Promise<PlatformImpersonationResponse>
      getPlatformAudit: (query: { limit: number; offset: number }) => Promise<PlatformAuditLog>
      getPlatformTenants: () => Promise<PlatformTenant[]>
      createPlatformTenant: (input: PlatformCreateTenantInput) => Promise<PlatformTenant>
      updatePlatformTenant: (slug: string, input: PlatformUpdateTenantInput) => Promise<PlatformTenant>
      /** Suspends (true) or reactivates (false) an organization. */
      setPlatformTenantSuspended: (slug: string, suspended: boolean) => Promise<PlatformTenant>
      /** Switches an organization's optional modules (Backoffice superadmin only). */
      setPlatformTenantModules: (slug: string, modules: OrganizationModules) => Promise<PlatformTenant>
      /** Replaces the superadmins' internal notes about the organization. */
      setPlatformTenantNotes: (slug: string, notes: PlatformTenantNotesInput) => Promise<PlatformTenant>
      /** Downloads the organization's full data export as a JSON file. */
      platformExportTenant: (slug: string) => Promise<PlatformTenantExportFile>
      /** Permanently deletes a suspended organization; `confirmSlug` must equal its slug. */
      platformDeleteTenant: (slug: string, confirmSlug: string) => Promise<PlatformTenantDeletion>
      resetPlatformUserPassword: (slug: string, userId: string, password: string) => Promise<AuthenticatedUser>
      getPlatformImpersonationActions: (id: number) => Promise<PlatformImpersonationAction[]>
      getPlatformBackups: () => Promise<PlatformBackups>
      /** Takes a SQLite backup copy now (audited); refused on PostgreSQL. */
      createPlatformBackup: () => Promise<PlatformBackup>
      /** Platform announcements: the session organization's active ones, and the sign-in page's. */
      getAnnouncements: () => Promise<import('@/types/announcement').Announcement[]>
      getPublicAnnouncements: (slug: string) => Promise<import('@/types/announcement').Announcement[]>
      /** Backoffice announcement management (every change is audited). */
      getPlatformAnnouncements: () => Promise<import('@/types/announcement').PlatformAnnouncement[]>
      createPlatformAnnouncement: (
        input: import('@/types/announcement').PlatformAnnouncementInput,
      ) => Promise<import('@/types/announcement').PlatformAnnouncement>
      updatePlatformAnnouncement: (
        id: string,
        input: import('@/types/announcement').PlatformAnnouncementInput,
      ) => Promise<import('@/types/announcement').PlatformAnnouncement>
      endPlatformAnnouncement: (id: string) => Promise<import('@/types/announcement').PlatformAnnouncement>
      deletePlatformAnnouncement: (id: string) => Promise<void>
      listUsers: () => Promise<ManagedUser[]>
      createUser: (input: CreateUserInput) => Promise<ManagedUser>
      updateUser: (id: string, input: UpdateUserInput) => Promise<ManagedUser>
      deleteUser: (id: string) => Promise<{ success: boolean }>
      getWorkOrders: (query?: WorkOrderListQuery) => Promise<WorkOrderListResult>
      /** Every order matching the filters (no paging) as the list CSV file. */
      exportWorkOrdersCsv: (query?: WorkOrderCsvExportQuery) => Promise<Blob>
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
      /** Warehouse stock (Magacin): levels and movement ledger (any user). */
      getStockLevels: (query?: StockLevelQuery) => Promise<StockLevelList>
      getStockMovements: (query?: StockMovementQuery) => Promise<StockMovementList>
      /** Prijem robe (any user). 422 on unknown article / quantity <= 0 / duplicates. */
      postStockReceipt: (input: StockReceiptInput) => Promise<StockPostingResult>
      /** Popis / opening balance (admin). Posts counted - onHand per line. */
      postStockCount: (input: StockCountInput) => Promise<StockPostingResult>
      /** Process templates (read: any user; write: admin). */
      getProcessTemplates: () => Promise<ProcessTemplate[]>
      getProcessTemplate: (id: string) => Promise<ProcessTemplate | null>
      createProcessTemplate: (input: ProcessTemplateInput) => Promise<ProcessTemplate>
      updateProcessTemplate: (id: string, input: ProcessTemplateInput) => Promise<ProcessTemplate>
      deleteProcessTemplate: (id: string) => Promise<void>
      /** The order's process; null when the order has none (or does not exist). */
      getWorkOrderProcess: (workOrderId: string) => Promise<WorkOrderProcess | null>
      /** Copies a template onto an order that has no process yet (409 otherwise). */
      applyProcessTemplate: (workOrderId: string, templateId: string) => Promise<WorkOrderProcess>
      updateWorkOrderProcess: (workOrderId: string, input: WorkOrderProcessInput) => Promise<WorkOrderProcess>
      deleteWorkOrderProcess: (workOrderId: string) => Promise<void>
      /** Backoffice: any organization's templates. */
      getPlatformProcessTemplates: (slug: string) => Promise<ProcessTemplate[]>
      createPlatformProcessTemplate: (slug: string, input: ProcessTemplateInput) => Promise<ProcessTemplate>
      updatePlatformProcessTemplate: (slug: string, id: string, input: ProcessTemplateInput) => Promise<ProcessTemplate>
      deletePlatformProcessTemplate: (slug: string, id: string) => Promise<void>
      /**
       * Planiranje (module `planning`; 403 PlanningModuleDisabled when off).
       * Reads: any user unless noted; writes: admin.
       */
      listMachineTypes: () => Promise<MachineType[]>
      createMachineType: (input: MachineTypeInput) => Promise<MachineType>
      updateMachineType: (id: string, input: MachineTypeInput) => Promise<MachineType>
      /** 409 while machines of this type exist. */
      deleteMachineType: (id: string) => Promise<void>
      listMachines: () => Promise<Machine[]>
      createMachine: (input: MachineInput) => Promise<Machine>
      updateMachine: (id: string, input: MachineInput) => Promise<Machine>
      deleteMachine: (id: string) => Promise<void>
      listQualifications: () => Promise<WorkerQualifications[]>
      setQualifications: (userId: string, input: WorkerQualificationsInput) => Promise<WorkerQualifications>
      /** Presence of every user on a local date "YYYY-MM-DD". */
      listAttendance: (date: string) => Promise<AttendanceEntry[]>
      setAttendance: (userId: string, input: AttendanceInput) => Promise<AttendanceEntry>
      getWorkingHours: () => Promise<WorkingHours>
      setWorkingHours: (input: WorkingHours) => Promise<WorkingHours>
      /** Draft (admins only), published plan and drift of a date. */
      getPlanDay: (date: string) => Promise<PlanDay>
      /** Replaces the date's draft with a freshly planned one. */
      generatePlan: (input: PlanGenerateInput) => Promise<ProductionPlan>
      updatePlanDraft: (input: PlanDraftInput) => Promise<ProductionPlan>
      deletePlanDraft: (date: string) => Promise<void>
      publishPlan: (input: PlanPublishInput) => Promise<ProductionPlan>
      /** The signed-in user's blocks of the published plan (date defaults to today). */
      getMyQueue: (date?: string) => Promise<MyQueue>
      getPlanningForecast: () => Promise<OrderForecast[]>
    }
  }
}

export {}
