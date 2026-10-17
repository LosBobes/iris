// Backoffice (the "platform" API). Contract-sync point with the Platform* schemas
// in iris-api/openapi.yaml. Aggregates only, except the account list used to
// pick whom to impersonate (id, username and role).

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

/** One row of GET /platform/impersonations. */
export interface PlatformImpersonation {
  id: number
  adminUsername: string
  tenantSlug: string
  tenantName: string
  userId: string
  username: string
  ip: string
  startedAt: string
  expiresAt: string
  /** Set once signed out (or found expired); null while it may be active. */
  endedAt: string | null
  actionCount: number
}

export interface PlatformImpersonationLog {
  items: PlatformImpersonation[]
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
