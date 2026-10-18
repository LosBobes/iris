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
  /** True once the account has enrolled an authenticator app (TOTP). */
  twoFactorEnabled?: boolean
}

export interface PlatformLoginResponse {
  success: boolean
  admin?: PlatformAdmin
  error?: string
  /** The password was right; finish with `platformLoginVerify(challenge, code)`. */
  twoFactorRequired?: boolean
  /** Single-use, valid 5 minutes. */
  challenge?: string
}

/** POST /platform/auth/2fa/setup: a pending TOTP enrollment. */
export interface PlatformTwoFactorSetup {
  /** Base32 secret, for typing into the app by hand. */
  secret: string
  otpauthUri: string
  /** The URI as a QR code, a `data:image/png;base64,` URL. */
  qrCode: string
}

/** POST /platform/auth/2fa/confirm: shown once, stored hashed. */
export interface PlatformTwoFactorEnabled {
  recoveryCodes: string[]
}

/** A superadmin account (GET /platform/admins). */
export interface PlatformAdminSummary {
  id: string
  username: string
  createdAt: string
  lastLoginAt: string | null
  twoFactorEnabled: boolean
  /** Still on a temporary password. */
  mustChangePassword: boolean
  disabledAt: string | null
}

export interface PlatformCreateAdminInput {
  username: string
  /** Temporary: the new superadmin must change it at first sign-in. */
  password: string
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
  /** Activity at a glance (counts and dates only). */
  health: PlatformTenantHealth
  /** Superadmin-only internal notes; the organization never sees them. */
  notes: PlatformTenantNotes
}

/** An organization's recent activity (GET /platform/tenants → health). */
export interface PlatformTenantHealth {
  /** Newest recorded sign-in; impersonation is not one. */
  lastLoginAt: string | null
  /** Distinct users who signed in within the window or hold a live session. */
  activeUsers7d: number
  activeUsers30d: number
  workOrdersCreated30d: number
  /** Not completed, cancelled or invoiced. */
  openWorkOrders: number
  /** No active user in 30 days, and the organization is older than that. */
  dormant: boolean
}

/** Superadmin-only notes about an organization (PUT /platform/tenants/{slug}/notes). */
export interface PlatformTenantNotes {
  contactName: string
  contactEmail: string
  contactPhone: string
  plan: string
  notes: string
  /** Set once saved. */
  updatedAt: string | null
  updatedBy: string | null
}

export type PlatformTenantNotesInput = Pick<
  PlatformTenantNotes,
  'contactName' | 'contactEmail' | 'contactPhone' | 'plan' | 'notes'
>

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
  | 'tenant.notes'
  | 'user.password_reset'
  | 'impersonate'
  | 'process_template.create'
  | 'process_template.update'
  | 'process_template.delete'
  | 'admin.create'
  | 'admin.disable'
  | 'admin.enable'
  | 'admin.2fa_enable'
  | 'admin.2fa_reset'
  | 'admin.login_failed'
  | 'admin.recovery_login'
  | 'backup.create'

/** One superadmin action in the Backoffice activity log (GET /platform/audit). */
export interface PlatformAuditEvent {
  id: number
  at: string
  adminUsername: string
  action: PlatformAuditAction
  /** Organization slug and name as they were at the time (empty on admin.* events). */
  tenantSlug: string
  tenantName: string
  targetUsername?: string
  /**
   * For tenant.update: fromName/toName, fromSlug/toSlug of what changed. For
   * tenant.modules: processes/stock = "on"|"off" (new values) and changed =
   * comma-joined names of the modules that changed. For admin.login_failed:
   * stage = "password" | "2fa" (adminUsername is the username as typed).
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
    /** Why it was started (empty for impersonations from before it was required). */
    reason: string
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
  engine: 'sqlite' | 'postgres'
  /** Highest applied schema migration. */
  schemaVersion: number
  backup: PlatformBackupStatus
}

/**
 * Backup summary. `supported` is false on PostgreSQL, where backups are taken
 * outside the API (pg_dump); `stale` is then always false.
 */
export interface PlatformBackupStatus {
  supported: boolean
  lastBackupAt: string | null
  /** The newest copy is missing or older than `staleAfterHours`. */
  stale: boolean
  staleAfterHours: number
  /** Automatic backup interval in seconds; 0 when off. */
  intervalSeconds: number
}

/** One backup copy on the server (listed only, never downloadable). */
export interface PlatformBackup {
  name: string
  sizeBytes: number
  createdAt: string
}

/** GET /platform/backups. */
export interface PlatformBackups extends PlatformBackupStatus {
  engine: 'sqlite' | 'postgres'
  /** Server path of the backup directory; empty when unsupported. */
  directory: string
  /** Copies retained; 0 keeps all. */
  keep: number
  total: number
  /** Newest first, at most 50. */
  items: PlatformBackup[]
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
