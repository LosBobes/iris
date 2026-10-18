package domain

// Organization offboarding (Backoffice): full data export and guarded
// deletion. Kept in its own file next to types.go; the shapes are part of the
// OpenAPI contract (PlatformTenantExport, PlatformDeleteTenantInput,
// PlatformTenantDeletion) and mirrored in apps/web/src/types/platform.ts.

// Backoffice audit actions for offboarding (PlatformAuditEvent.Action).
const (
	AuditTenantExport = "tenant.export"
	AuditTenantDelete = "tenant.delete"
)

// PlatformTenantExportFormat names the document GET
// /platform/tenants/{slug}/export returns; PlatformTenantExportVersion is
// bumped whenever its layout changes incompatibly.
const (
	PlatformTenantExportFormat  = "iris-tenant-export"
	PlatformTenantExportVersion = 1
)

// PlatformTenantExport is a full copy of one organization's data, table by
// table, as rows of column -> value. Secrets are left out: users carry no
// password_hash and sessions are not exported at all. Columns that hold JSON
// (work-order payloads, process graphs) are embedded as JSON, not as strings.
type PlatformTenantExport struct {
	Format        string                      `json:"format"`
	FormatVersion int                         `json:"formatVersion"`
	ExportedAt    string                      `json:"exportedAt"`
	SchemaVersion int                         `json:"schemaVersion"`
	Tenant        PlatformTenantExportTenant  `json:"tenant"`
	TotalRows     int                         `json:"totalRows"`
	Counts        map[string]int              `json:"counts"`
	Tables        map[string][]map[string]any `json:"tables"`
}

// PlatformTenantExportTenant is the exported organization record.
type PlatformTenantExportTenant struct {
	ID          string  `json:"id"`
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	CreatedAt   string  `json:"createdAt"`
	SuspendedAt *string `json:"suspendedAt"`
}

// PlatformDeleteTenantInput is the DELETE /platform/tenants/{slug} body: the
// organization's slug typed again, exactly.
type PlatformDeleteTenantInput struct {
	ConfirmSlug string `json:"confirmSlug"`
}

// PlatformTenantDeletion reports a deleted organization and how many rows each
// table lost.
type PlatformTenantDeletion struct {
	Slug      string         `json:"slug"`
	Name      string         `json:"name"`
	DeletedAt string         `json:"deletedAt"`
	TotalRows int            `json:"totalRows"`
	Rows      map[string]int `json:"rows"`
}
