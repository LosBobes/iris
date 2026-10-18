package domain

// Platform announcements: a message a Backoffice superadmin shows to every
// organization, or to a chosen few, as a banner at the top of the app (and on
// the organization's sign-in page) between a start and an optional end time.

// Announcement severities. Info banners can be dismissed by the user; warning
// and maintenance ones stay until they end.
const (
	AnnouncementInfo        = "info"
	AnnouncementWarning     = "warning"
	AnnouncementMaintenance = "maintenance"
)

// Announcement states, computed from the time window when read.
const (
	AnnouncementActive    = "active"
	AnnouncementScheduled = "scheduled"
	AnnouncementEnded     = "ended"
)

// MaxAnnouncementMessageLength caps the plain-text message (in characters).
const MaxAnnouncementMessageLength = 500

// Backoffice audit actions for announcements (PlatformAuditEvent.Action).
const (
	AuditAnnouncementCreate = "announcement.create"
	AuditAnnouncementUpdate = "announcement.update"
	AuditAnnouncementEnd    = "announcement.end"
	AuditAnnouncementDelete = "announcement.delete"
)

// Announcement is what an organization's users see: only the message, its
// severity and its time window.
type Announcement struct {
	ID       string  `json:"id"`
	Message  string  `json:"message"`
	Severity string  `json:"severity"`
	StartsAt string  `json:"startsAt"`
	EndsAt   *string `json:"endsAt"`
}

// PlatformAnnouncementTenant names one targeted organization (current slug and
// name, so a renamed organization stays targeted).
type PlatformAnnouncementTenant struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// PlatformAnnouncement is the Backoffice view of an announcement.
type PlatformAnnouncement struct {
	Announcement
	// Status is active, scheduled or ended at the time of the request.
	Status     string                       `json:"status"`
	AllTenants bool                         `json:"allTenants"`
	Tenants    []PlatformAnnouncementTenant `json:"tenants"`
	CreatedAt  string                       `json:"createdAt"`
	CreatedBy  string                       `json:"createdBy"`
	UpdatedAt  string                       `json:"updatedAt"`
}

// PlatformAnnouncementInput creates or replaces an announcement. StartsAt
// defaults to now; a null EndsAt keeps it up until it is ended. TenantSlugs is
// required (non-empty) unless AllTenants is set, and ignored when it is.
type PlatformAnnouncementInput struct {
	Message     string   `json:"message"`
	Severity    string   `json:"severity"`
	StartsAt    *string  `json:"startsAt"`
	EndsAt      *string  `json:"endsAt"`
	AllTenants  bool     `json:"allTenants"`
	TenantSlugs []string `json:"tenantSlugs"`
}
