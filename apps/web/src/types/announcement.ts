// Platform announcements. Contract-sync point with the Announcement,
// PlatformAnnouncement and PlatformAnnouncementInput schemas in
// iris-api/openapi.yaml and iris-api/internal/domain/announcement.go.

export type AnnouncementSeverity = 'info' | 'warning' | 'maintenance'

export const ANNOUNCEMENT_SEVERITIES: readonly AnnouncementSeverity[] = ['info', 'warning', 'maintenance']

/** Longest message the API accepts (characters). */
export const MAX_ANNOUNCEMENT_MESSAGE_LENGTH = 500

/** What an organization's users see (GET /announcements, and on the sign-in page). */
export interface Announcement {
  id: string
  /** Plain text. */
  message: string
  severity: AnnouncementSeverity
  /** UTC, `YYYY-MM-DDTHH:MM:SSZ`. */
  startsAt: string
  /** UTC; null means until ended. */
  endsAt: string | null
}

export type PlatformAnnouncementStatus = 'active' | 'scheduled' | 'ended'

/** The Backoffice view (GET /platform/announcements). */
export interface PlatformAnnouncement extends Announcement {
  status: PlatformAnnouncementStatus
  allTenants: boolean
  /** Targeted organizations (current slug and name); empty when allTenants. */
  tenants: { slug: string; name: string }[]
  createdAt: string
  /** Superadmin username. */
  createdBy: string
  updatedAt: string
}

export interface PlatformAnnouncementInput {
  message: string
  severity: AnnouncementSeverity
  /** RFC 3339; defaults to now. */
  startsAt?: string | null
  /** RFC 3339; null keeps it up until ended. */
  endsAt?: string | null
  allTenants: boolean
  /** Required (non-empty) unless allTenants. */
  tenantSlugs: string[]
}
