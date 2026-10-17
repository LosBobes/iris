// Backoffice (the "platform" API). Contract-sync point with the Platform* schemas
// in iris-api/openapi.yaml: usage metrics, organization management and the
// activity log.

import type { OrganizationModules } from '@/types/settings'

export type PlatformRangeDays = 7 | 30 | 90 | 365

export interface PlatformAdmin {
  username: string
  /** Always "superadmin": the only role that opens the Backoffice. */
  role?: 'superadmin'
  /** True until the account replaces its initial password (e.g. the seeded default). */
  mustChangePassword?: boolean
}

export interface PlatformLoginResponse {
  success: boolean
  admin?: PlatformAdmin
  error?: string
}

/** GET /platform/tenants/{slug}/users: an organization and its accounts. */
export interface PlatformTenantUsers {
  tenant: { id: string; slug: string; name: string }
  users: AuthenticatedUser[]
}

/** POST /platform/tenants/{slug}/impersonate: the organization session opened. */
export interface PlatformImpersonationResponse {
  success: boolean
  user?: AuthenticatedUser
  orgSlug?: string
  expiresAt?: string
}

/** An organization as the Backoffice manages it (GET /platform/tenants). */
export interface PlatformTenant {
  id: string
  slug: string
  name: string
  createdAt: string
  /** Set while the organization is suspended. */
  suspendedAt: string | null
  users: number
  admins: number
  /** Optional modules switched on for the organization (both off by default). */
  modules: OrganizationModules
}

export interface PlatformCreateTenantInput {
  name: string
  slug: string
  adminUsername: string
  adminPassword: string
}

export interface PlatformUpdateTenantInput {
  name?: string
  slug?: string
}

export type PlatformAuditAction =
  | 'tenant.create'
  | 'tenant.update'
  | 'tenant.suspend'
  | 'tenant.reactivate'
  | 'tenant.modules'
  | 'user.password_reset'
  | 'impersonate'
  | 'process_template.create'
  | 'process_template.update'
  | 'process_template.delete'

/** One superadmin action in the Backoffice activity log (GET /platform/audit). */
export interface PlatformAuditEvent {
  id: number
  at: string
  adminUsername: string
  action: PlatformAuditAction
  /** Organization slug and name as they were at the time. */
  tenantSlug: string
  tenantName: string
  targetUsername?: string
  /**
   * For tenant.update: fromName/toName, fromSlug/toSlug of what changed. For
   * tenant.modules: processes/stock = "on"|"off" (new values) and changed =
   * comma-joined names of the modules that changed.
   */
  detail?: Record<string, string>
  ip: string
  /** On an "impersonate" event: its session state and change count. */
  impersonation?: {
    id: number
    expiresAt: string
    /** Set once signed out (or found expired); null while it may be active. */
    endedAt: string | null
    actionCount: number
  }
}

export interface PlatformAuditLog {
  items: PlatformAuditEvent[]
  total: number
}

/** A change request made during an impersonation (bodies are never kept). */
export interface PlatformImpersonationAction {
  at: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** The API route pattern, e.g. `/work-orders/{id}`. */
  route: string
  path: string
  status: number
}

export interface PlatformPasswordChange {
  currentPassword: string
  newPassword: string
}

export interface PlatformTotals {
  tenants: number
  users: number
  customers: number
  catalogItems: number
  workOrders: number
  workOrdersInRange: number
  openWorkOrders: number
  loginsInRange: number
  activeUsersInRange: number
  activeSessions: number
  databaseBytes: number
}

export interface PlatformSystem {
  release: string
  goVersion: string
  startedAt: string
  uptimeSeconds: number
  goroutines: number
  heapBytes: number
}

export interface PlatformTenantMetrics {
  id: string
  slug: string
  name: string
  createdAt: string
  users: number
  admins: number
  customers: number
  catalogItems: number
  workOrders: number
  workOrdersInRange: number
  openWorkOrders: number
  statusCounts: Record<string, number>
  loginsInRange: number
  activeUsersInRange: number
  activeSessions: number
  lastWorkOrderAt: string | null
  lastLoginAt: string | null
  hasLoginLogo: boolean
}

export interface PlatformDailyPoint {
  date: string
  /** Keyed by organization slug, zero-filled. */
  workOrders: Record<string, number>
  logins: Record<string, number>
}

export interface PlatformMetrics {
  generatedAt: string
  rangeDays: PlatformRangeDays
  rangeStart: string
  totals: PlatformTotals
  system: PlatformSystem
  tenants: PlatformTenantMetrics[]
  daily: PlatformDailyPoint[]
}
