package domain

import "encoding/json"

// The domain package holds the data shapes shared across the API.
//
// Read this file after internal/api/server.go if you want to understand what
// each endpoint sends and receives on the wire.

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type DeliveryMethod string

const (
	DeliveryMethodPickup      DeliveryMethod = "pickup"
	DeliveryMethodPostExpress DeliveryMethod = "postExpress"
	DeliveryMethodCityExpress DeliveryMethod = "cityExpress"
	DeliveryMethodFieldVisit  DeliveryMethod = "fieldVisit"
)

type PostagePaymentType string

const (
	PostagePaymentTypeCOD        PostagePaymentType = "cod"
	PostagePaymentTypeOurAccount PostagePaymentType = "ourAccount"
	PostagePaymentTypeAdvance    PostagePaymentType = "advance"
	PostagePaymentTypeViaInvoice PostagePaymentType = "viaInvoice"
)

type BillingDocumentType string

const (
	BillingDocumentTypeInvoice        BillingDocumentType = "invoice"
	BillingDocumentTypeCashCollection BillingDocumentType = "cashCollection"
	BillingDocumentTypeProforma       BillingDocumentType = "proforma"
)

type WorkOrderStatus string

const (
	// Legacy statuses are accepted from older fixtures and normalized by the store.
	WorkOrderStatusDraft      WorkOrderStatus = "draft"
	WorkOrderStatusActive     WorkOrderStatus = "active"
	WorkOrderStatusNew        WorkOrderStatus = "new"
	WorkOrderStatusAssigned   WorkOrderStatus = "assigned"
	WorkOrderStatusInProgress WorkOrderStatus = "inProgress"
	WorkOrderStatusCompleted  WorkOrderStatus = "completed"
	WorkOrderStatusCancelled  WorkOrderStatus = "cancelled"
	WorkOrderStatusInvoiced   WorkOrderStatus = "invoiced"

	// Retired statuses: accepted from older data and normalized to inProgress.
	WorkOrderStatusWaitingForCustomer  WorkOrderStatus = "waitingForCustomer"
	WorkOrderStatusWaitingForMaterials WorkOrderStatus = "waitingForMaterials"
)

type WorkOrderPriority string

const (
	WorkOrderPriorityLow    WorkOrderPriority = "low"
	WorkOrderPriorityNormal WorkOrderPriority = "normal"
	WorkOrderPriorityHigh   WorkOrderPriority = "high"
	WorkOrderPriorityUrgent WorkOrderPriority = "urgent"
)

type WorkOrderNoteVisibility string

const (
	WorkOrderNoteInternal WorkOrderNoteVisibility = "internal"
	WorkOrderNoteCustomer WorkOrderNoteVisibility = "customer"
)

type InvoiceDraftStatus string

const (
	InvoiceDraftStatusNone   InvoiceDraftStatus = "none"
	InvoiceDraftStatusDraft  InvoiceDraftStatus = "draft"
	InvoiceDraftStatusIssued InvoiceDraftStatus = "issued"
	InvoiceDraftStatusPaid   InvoiceDraftStatus = "paid"
)

type InvoiceLineItemKind string

const (
	InvoiceLineItemKindService InvoiceLineItemKind = "service"
	InvoiceLineItemKindGoods   InvoiceLineItemKind = "goods"
)

type InvoiceUnit string

const (
	InvoiceUnitKom InvoiceUnit = "kom"
	InvoiceUnitM2  InvoiceUnit = "m2"
	InvoiceUnitSet InvoiceUnit = "set"
)

// CatalogItemKind separates services the shop performs from physical goods it
// sells. It mirrors InvoiceLineItemKind (service/goods) so a catalog item maps
// cleanly onto a work-order line item.
type CatalogItemKind string

const (
	CatalogItemKindService CatalogItemKind = "service"
	CatalogItemKindArticle CatalogItemKind = "article"
)

// CatalogItem is an admin-managed article or service that regular users select
// when building work orders. The legacy print-shop catalog (MdArt) is imported
// into this shape: Code=SIFRA, Kind from USLUGA, Unit from JMERE, SalePrice
// from PRODCEN, Barcode/TaxGroup/Description from BARCODE/TARGR/OPIS.
//
// PurchasePrice is the cost figure: for articles it is the purchase price
// (nabavna cena), for services the cost of labor (cena rada). It is
// admin-only — the API strips it from responses to non-admin users so regular
// operators never see cost/margin data. SalePrice (prodajna cena) is what the
// firm charges and is visible to everyone.
type CatalogItem struct {
	ID            string          `json:"id"`
	Code          string          `json:"code"`
	Name          string          `json:"name"`
	Kind          CatalogItemKind `json:"kind"`
	Unit          string          `json:"unit"`
	PurchasePrice *float64        `json:"purchasePrice"`
	SalePrice     *float64        `json:"salePrice"`
	Barcode       *string         `json:"barcode"`
	TaxGroup      *string         `json:"taxGroup"`
	Description   *string         `json:"description"`
	IsActive      bool            `json:"isActive"`
	// StockOnHand is the warehouse balance (sum of the article's stock
	// movements). Read-only and computed; nil for services.
	StockOnHand *float64 `json:"stockOnHand"`
	// MinStock is the reorder threshold (>= 0) for articles; nil when unset and
	// for services. Editable through CatalogItemInput.
	MinStock  *float64 `json:"minStock"`
	CreatedAt string   `json:"createdAt,omitempty"`
	UpdatedAt string   `json:"updatedAt,omitempty"`
}

// DefaultTaxGroup is the PDV type a catalog item gets when none is set: the
// label for the general 20% rate (opšta stopa; "Đ" on fiscal receipts). The other
// labels the web UI offers are "E" (special 10% rate) and "A" (exempt).
const DefaultTaxGroup = "DJ"

// CatalogItemCost is one effective-dated cost record in a catalog item's price
// history (1-N to CatalogItem). The store appends a new record whenever an admin
// changes an item's price, stamping EffectiveFrom = today and closing the prior
// record (EffectiveTo). A nil EffectiveTo marks the currently-effective record.
// Work orders snapshot the cost in effect on their issue/completion date.
type CatalogItemCost struct {
	ID            string   `json:"id"`
	CatalogItemID string   `json:"catalogItemId"`
	PurchasePrice *float64 `json:"purchasePrice"`
	SalePrice     *float64 `json:"salePrice"`
	EffectiveFrom string   `json:"effectiveFrom"`
	EffectiveTo   *string  `json:"effectiveTo"`
	CreatedAt     string   `json:"createdAt"`
}

// CatalogItemInput is the payload an admin submits when creating or editing a
// catalog item.
//
// EffectiveFrom is the date (YYYY-MM-DD) a changed price takes effect. It is
// optional (nil ⇒ today) and, when set, must be today or later — the API rejects
// past dates. A future date schedules the new price without changing the item's
// currently-displayed price until that date arrives.
type CatalogItemInput struct {
	Code          string          `json:"code"`
	Name          string          `json:"name"`
	Kind          CatalogItemKind `json:"kind"`
	Unit          string          `json:"unit"`
	PurchasePrice *float64        `json:"purchasePrice"`
	SalePrice     *float64        `json:"salePrice"`
	Barcode       *string         `json:"barcode"`
	TaxGroup      *string         `json:"taxGroup"`
	Description   *string         `json:"description"`
	IsActive      bool            `json:"isActive"`
	MinStock      *float64        `json:"minStock"`
	EffectiveFrom *string         `json:"effectiveFrom,omitempty"`
}

// DefaultFirmName is the shop's display name shown in the app branding until an
// administrator changes it via the organization settings.
const DefaultFirmName = "Grafika Čobanović"

// PDFSections controls which optional sections of the work-order printout are
// rendered; all of them default to true (see DefaultPDFSections) so an
// unconfigured shop keeps the full sheet.
//
// The napomena (notes) box is deliberately not toggleable. It is the only
// destination for the work order's free-text note, so hiding the box would
// leave the form's napomena field writing to nowhere. The box always renders
// and the field is always offered.
type PDFSections struct {
	Delivery        bool `json:"delivery"`
	Billing         bool `json:"billing"`
	ShippingAddress bool `json:"shippingAddress"`
	Completion      bool `json:"completion"`
	Signatures      bool `json:"signatures"`
}

// DefaultPDFSections returns the configuration used when a shop has not
// customized its printout: every optional section enabled.
func DefaultPDFSections() PDFSections {
	return PDFSections{
		Delivery:        true,
		Billing:         true,
		ShippingAddress: true,
		Completion:      true,
		Signatures:      true,
	}
}

// DefaultBillingDocumentType is the document type (tip dokumenta) new work
// orders start with until an administrator changes it in the settings.
const DefaultBillingDocumentType = BillingDocumentTypeProforma

// BillingDefaults controls the work-order document type (tip dokumenta): the
// value new orders start with. The type is always changeable per order, so the
// default only seeds the picker on a fresh order.
type BillingDefaults struct {
	DocumentType BillingDocumentType `json:"documentType"`
}

// DefaultBillingDefaults returns the configuration used when a shop has not
// customized its document-type behavior: proforma.
func DefaultBillingDefaults() BillingDefaults {
	return BillingDefaults{
		DocumentType: DefaultBillingDocumentType,
	}
}

// DefaultWorkOrderPriority is the priority (prioritet) new work orders start
// with until an administrator changes it in the settings.
const DefaultWorkOrderPriority = WorkOrderPriorityNormal

// PriorityDefaults controls the work-order priority (prioritet): the value new
// orders start with, and whether it may be changed per order. When AllowOverride
// is false the clients hide the picker and always use Priority.
type PriorityDefaults struct {
	Priority      WorkOrderPriority `json:"priority"`
	AllowOverride bool              `json:"allowOverride"`
}

// DefaultPriorityDefaults returns the configuration used when a shop has not
// customized its priority behavior: normal, not overridable.
func DefaultPriorityDefaults() PriorityDefaults {
	return PriorityDefaults{
		Priority:      DefaultWorkOrderPriority,
		AllowOverride: false,
	}
}

// PrintItemColumn is one of the numeric columns in the work-order printout's
// "stavke" (line items) table. The item name always leads the row; only these
// three are reorderable.
type PrintItemColumn string

const (
	PrintItemColumnQuantity  PrintItemColumn = "quantity"
	PrintItemColumnUnitPrice PrintItemColumn = "unitPrice"
	PrintItemColumnTotal     PrintItemColumn = "total"
)

// DefaultPrintItemColumns is the shop-preferred reading order: how many, at what
// price, for how much.
func DefaultPrintItemColumns() []PrintItemColumn {
	return []PrintItemColumn{
		PrintItemColumnQuantity,
		PrintItemColumnUnitPrice,
		PrintItemColumnTotal,
	}
}

// OrganizationSettings holds shop-wide branding/config an admin can edit: the
// firm name shown in the app header, the work-order PDF section toggles, the
// order of the printout's line-item columns, the default document type and
// priority for new work orders, and whether the work-order form exposes the
// extra shipping/handling options.
type OrganizationSettings struct {
	FirmName         string           `json:"firmName"`
	PDFSections      PDFSections      `json:"pdfSections"`
	BillingDefaults  BillingDefaults  `json:"billingDefaults"`
	PriorityDefaults PriorityDefaults `json:"priorityDefaults"`
	// PrintItemColumns is the left-to-right order of the printout's numeric
	// line-item columns. Always a permutation of the three known columns.
	PrintItemColumns []PrintItemColumn `json:"printItemColumns"`
	// ShowShippingOptions toggles the work-order form's extra shipping/handling
	// fields (drives-out, wait-for-payment, packaging, labeling, fragile,
	// signature, insurance). Off by default so the form stays compact.
	ShowShippingOptions bool `json:"showShippingOptions"`
	// Modules reports which optional modules the organization has. Read-only
	// here: only Backoffice superadmins switch them (PUT /platform/tenants/{slug}/modules),
	// and PUT /settings ignores it.
	Modules OrganizationModules `json:"modules"`
}

// OrganizationModules are the optional per-organization feature modules. Both
// are off by default and independent of each other: "processes" enables process
// templates, per-order processes and the simulator; "stock" enables the
// warehouse (magacin). With both on, process item nodes link to articles and
// steps post stock movements.
type OrganizationModules struct {
	Processes bool `json:"processes"`
	Stock     bool `json:"stock"`
}

// OrganizationModulesUpdate is a partial module switch used by irisctl
// set-modules; a nil field is left unchanged.
type OrganizationModulesUpdate struct {
	Processes *bool
	Stock     *bool
}

// OrganizationSettingsUpdate is the partial-update payload for PUT /settings.
// Nil fields are left unchanged, so a firm-name-only save does not wipe the PDF
// configuration and vice versa.
type OrganizationSettingsUpdate struct {
	FirmName            *string            `json:"firmName"`
	PDFSections         *PDFSections       `json:"pdfSections"`
	BillingDefaults     *BillingDefaults   `json:"billingDefaults"`
	PriorityDefaults    *PriorityDefaults  `json:"priorityDefaults"`
	PrintItemColumns    *[]PrintItemColumn `json:"printItemColumns"`
	ShowShippingOptions *bool              `json:"showShippingOptions"`
}

// LoginLogo is the image an organization shows on its sign-in screen. Admins
// upload it from Settings; the public organization endpoints serve it before
// anyone is signed in.
type LoginLogo struct {
	ContentType string
	Data        []byte
}

// LoginLogoUpload is the PUT /settings/login-logo payload: the raw image bytes,
// base64-encoded, with the content type the client believes it has. The server
// sniffs the bytes and rejects anything that is not PNG, JPEG or WebP.
type LoginLogoUpload struct {
	ContentType string `json:"contentType"`
	Data        string `json:"data"`
}

// LoginLogoInfo is returned after an upload. LogoVersion changes whenever the
// image does, so clients can use it to bust caches.
type LoginLogoInfo struct {
	LogoVersion string `json:"logoVersion"`
}

// PublicOrganization is what the sign-in screen may learn about an
// organization before authentication: that it exists, its display name, and
// whether (and which version of) a login logo it has.
type PublicOrganization struct {
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	LogoVersion *string `json:"logoVersion"`
}

// PlatformAdmin is an Iris operator account. It belongs to no organization; it
// reads the aggregate usage metrics below and can open an audited session as
// any organization user (impersonation).
// PlatformRoleSuperadmin is the Backoffice role: the only one that opens the
// Backoffice (/backoffice in the web app, /platform/* in the API).
const PlatformRoleSuperadmin = "superadmin"

type PlatformAdmin struct {
	ID       string `json:"-"`
	Username string `json:"username"`
	Role     string `json:"role"`
	// MustChangePassword is set on the seeded default account (and any account
	// whose password was not chosen by its owner): the console then allows
	// nothing but a password change.
	MustChangePassword bool `json:"mustChangePassword"`
	// TwoFactorEnabled is set once the account has enrolled an authenticator
	// app (TOTP); sign-in then needs a code as a second step. It is mandatory:
	// until it is set, the console allows nothing but enrolling.
	TwoFactorEnabled bool `json:"twoFactorEnabled"`
}

// PlatformLoginVerifyRequest is the POST /platform/auth/login/verify payload:
// the challenge from the password step and a TOTP or recovery code.
type PlatformLoginVerifyRequest struct {
	Challenge string `json:"challenge"`
	Code      string `json:"code"`
}

// PlatformTwoFactorSetup is a pending TOTP enrollment: the secret to type in
// (or scan) and the otpauth URI, also as a QR code PNG data URL.
type PlatformTwoFactorSetup struct {
	Secret     string `json:"secret"`
	OtpauthURI string `json:"otpauthUri"`
	QRCode     string `json:"qrCode"`
}

// PlatformTwoFactorConfirm confirms an enrollment with a code from the app.
type PlatformTwoFactorConfirm struct {
	Code string `json:"code"`
}

// PlatformTwoFactorEnabled reports a finished enrollment with its one-time
// recovery codes, shown this once (only their hashes are stored).
type PlatformTwoFactorEnabled struct {
	RecoveryCodes []string `json:"recoveryCodes"`
}

// PlatformAdminSummary is a superadmin account as the Backoffice lists it.
type PlatformAdminSummary struct {
	ID                 string  `json:"id"`
	Username           string  `json:"username"`
	CreatedAt          string  `json:"createdAt"`
	LastLoginAt        *string `json:"lastLoginAt"`
	TwoFactorEnabled   bool    `json:"twoFactorEnabled"`
	MustChangePassword bool    `json:"mustChangePassword"`
	DisabledAt         *string `json:"disabledAt"`
}

// PlatformCreateAdminInput adds a superadmin with a temporary password that
// must be changed at first sign-in.
type PlatformCreateAdminInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// PlatformPasswordChange is the POST /platform/auth/password payload.
type PlatformPasswordChange struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type PlatformLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type PlatformLoginResponse struct {
	Success bool           `json:"success"`
	Admin   *PlatformAdmin `json:"admin,omitempty"`
	Error   string         `json:"error,omitempty"`
	// TwoFactorRequired (with Challenge) answers a correct password on an
	// account with two-factor sign-in: send a code with the challenge to
	// /platform/auth/login/verify.
	TwoFactorRequired bool   `json:"twoFactorRequired,omitempty"`
	Challenge         string `json:"challenge,omitempty"`
}

// PlatformTenantUsers lists one organization's accounts (id, username, role
// only) so a superadmin can pick whom to impersonate.
type PlatformTenantUsers struct {
	Tenant Tenant `json:"tenant"`
	Users  []User `json:"users"`
}

// PlatformImpersonationRequest is the POST /platform/tenants/{slug}/impersonate
// payload.
type PlatformImpersonationRequest struct {
	UserID string `json:"userId"`
	// Reason is required: a short note on why the superadmin goes in, kept
	// with the impersonation and shown in the activity log.
	Reason string `json:"reason"`
}

// MaxImpersonationReasonLength bounds the impersonation reason (in characters).
const MaxImpersonationReasonLength = 200

// PlatformImpersonationResponse reports the organization session that was
// opened (as the iris_session cookie) for the chosen user.
type PlatformImpersonationResponse struct {
	Success   bool   `json:"success"`
	User      *User  `json:"user,omitempty"`
	OrgSlug   string `json:"orgSlug,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
}

// PlatformTenant is an organization as the Backoffice manages it.
type PlatformTenant struct {
	ID          string  `json:"id"`
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	CreatedAt   string  `json:"createdAt"`
	SuspendedAt *string `json:"suspendedAt"`
	Users       int     `json:"users"`
	Admins      int     `json:"admins"`
	// Modules are the organization's optional feature modules (both off by default).
	Modules OrganizationModules `json:"modules"`
	// Health is the organization's activity at a glance (counts and dates only).
	Health PlatformTenantHealth `json:"health"`
	// Notes are the superadmins' internal notes; the organization never sees them.
	Notes PlatformTenantNotes `json:"notes"`
}

// PlatformTenantHealth summarizes an organization's recent activity for the
// Backoffice list. Aggregates only — never customer, user or work-order records.
type PlatformTenantHealth struct {
	// LastLoginAt is the newest recorded sign-in (impersonation is not one).
	LastLoginAt *string `json:"lastLoginAt"`
	// ActiveUsers7d / ActiveUsers30d count distinct users who signed in within
	// the window or hold a live, non-impersonated session.
	ActiveUsers7d        int `json:"activeUsers7d"`
	ActiveUsers30d       int `json:"activeUsers30d"`
	WorkOrdersCreated30d int `json:"workOrdersCreated30d"`
	OpenWorkOrders       int `json:"openWorkOrders"`
	// Dormant: nobody signed in for TenantDormantDays and the organization is
	// older than that (a brand-new one is not dormant yet).
	Dormant bool `json:"dormant"`
}

// TenantDormantDays is the sign-in silence after which an organization counts
// as dormant.
const TenantDormantDays = 30

// PlatformTenantNotes are superadmin-only internal notes about an organization.
type PlatformTenantNotes struct {
	ContactName  string `json:"contactName"`
	ContactEmail string `json:"contactEmail"`
	ContactPhone string `json:"contactPhone"`
	Plan         string `json:"plan"`
	Notes        string `json:"notes"`
	// UpdatedAt / UpdatedBy are set once the notes have been saved.
	UpdatedAt *string `json:"updatedAt"`
	UpdatedBy *string `json:"updatedBy"`
}

// PlatformTenantNotesInput replaces an organization's internal notes.
type PlatformTenantNotesInput struct {
	ContactName  string `json:"contactName"`
	ContactEmail string `json:"contactEmail"`
	ContactPhone string `json:"contactPhone"`
	Plan         string `json:"plan"`
	Notes        string `json:"notes"`
}

// PlatformCreateTenantInput creates an organization with its first admin.
type PlatformCreateTenantInput struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	AdminUsername string `json:"adminUsername"`
	AdminPassword string `json:"adminPassword"`
}

// PlatformUpdateTenantInput renames an organization and/or changes its
// sign-in slug; a nil field is left unchanged.
type PlatformUpdateTenantInput struct {
	Name *string `json:"name"`
	Slug *string `json:"slug"`
}

// PlatformPasswordReset sets a new password for an organization user.
type PlatformPasswordReset struct {
	Password string `json:"password"`
}

// Backoffice audit actions (PlatformAuditEvent.Action).
const (
	AuditTenantCreate       = "tenant.create"
	AuditTenantUpdate       = "tenant.update"
	AuditTenantSuspend      = "tenant.suspend"
	AuditTenantReactivate   = "tenant.reactivate"
	AuditTenantModules      = "tenant.modules"
	AuditTenantNotes        = "tenant.notes"
	AuditUserPasswordReset  = "user.password_reset"
	AuditImpersonationStart = "impersonate"

	// Superadmin accounts and sign-in (no organization).
	AuditAdminRecoveryLogin  = "admin.recovery_login"
	AuditAdminLoginFailed    = "admin.login_failed"
	AuditAdminTwoFactorOn    = "admin.2fa_enable"
	AuditAdminTwoFactorReset = "admin.2fa_reset"
	AuditAdminCreate         = "admin.create"
	AuditAdminDisable        = "admin.disable"
	AuditAdminEnable         = "admin.enable"
)

// PlatformAuditEvent is one superadmin action in the Backoffice activity log.
// Organization name and slug are as they were at the time.
type PlatformAuditEvent struct {
	ID             int64             `json:"id"`
	At             string            `json:"at"`
	AdminUsername  string            `json:"adminUsername"`
	Action         string            `json:"action"`
	TenantSlug     string            `json:"tenantSlug"`
	TenantName     string            `json:"tenantName"`
	TargetUsername string            `json:"targetUsername,omitempty"`
	Detail         map[string]string `json:"detail,omitempty"`
	IP             string            `json:"ip"`
	// Impersonation is set on an "impersonate" event: its session state and
	// how many changes it made (see /platform/impersonations/{id}/actions).
	Impersonation *PlatformImpersonationStatus `json:"impersonation,omitempty"`
}

// PlatformImpersonationStatus is the session side of an impersonation.
type PlatformImpersonationStatus struct {
	ID          int64   `json:"id"`
	ExpiresAt   string  `json:"expiresAt"`
	EndedAt     *string `json:"endedAt"`
	ActionCount int     `json:"actionCount"`
	// Reason is what the superadmin gave when starting it (empty for
	// impersonations recorded before it was required).
	Reason string `json:"reason"`
}

// PlatformAuditLog is a page of the activity log, newest first.
type PlatformAuditLog struct {
	Items []PlatformAuditEvent `json:"items"`
	Total int                  `json:"total"`
}

// PlatformImpersonationAction is one change request made during an
// impersonation. Request bodies are never kept (they can hold passwords).
type PlatformImpersonationAction struct {
	At     string `json:"at"`
	Method string `json:"method"`
	Route  string `json:"route"`
	Path   string `json:"path"`
	Status int    `json:"status"`
}

// PlatformMetrics is the operator dashboard payload: counts, dates and sizes
// only. It never carries a customer, user or work-order record.
type PlatformMetrics struct {
	GeneratedAt string                  `json:"generatedAt"`
	RangeDays   int                     `json:"rangeDays"`
	RangeStart  string                  `json:"rangeStart"`
	Totals      PlatformTotals          `json:"totals"`
	System      PlatformSystem          `json:"system"`
	Tenants     []PlatformTenantMetrics `json:"tenants"`
	Daily       []PlatformDailyPoint    `json:"daily"`
}

type PlatformTotals struct {
	Tenants            int   `json:"tenants"`
	Users              int   `json:"users"`
	Customers          int   `json:"customers"`
	CatalogItems       int   `json:"catalogItems"`
	WorkOrders         int   `json:"workOrders"`
	WorkOrdersInRange  int   `json:"workOrdersInRange"`
	OpenWorkOrders     int   `json:"openWorkOrders"`
	LoginsInRange      int   `json:"loginsInRange"`
	ActiveUsersInRange int   `json:"activeUsersInRange"`
	ActiveSessions     int   `json:"activeSessions"`
	DatabaseBytes      int64 `json:"databaseBytes"`
}

type PlatformSystem struct {
	// Version is the API's app version (the VERSION file baked in at build
	// time, "dev" for a source build); Commit is the git commit it was built
	// from, empty when unknown.
	Version string `json:"version"`
	Commit  string `json:"commit"`
	// DatabaseEngine is the storage engine the API runs on: "sqlite" or
	// "postgres".
	DatabaseEngine string `json:"databaseEngine"`
	Release        string `json:"release"`
	GoVersion      string `json:"goVersion"`
	StartedAt      string `json:"startedAt"`
	UptimeSeconds  int64  `json:"uptimeSeconds"`
	Goroutines     int    `json:"goroutines"`
	HeapBytes      uint64 `json:"heapBytes"`
	// SchemaVersion is the highest applied migration.
	SchemaVersion int                  `json:"schemaVersion"`
	Backup        PlatformBackupStatus `json:"backup"`
}

// AuditBackupCreate is the audit action of a backup taken from the Backoffice.
const AuditBackupCreate = "backup.create"

// PlatformBackupStatus summarizes backups for the dashboard. On PostgreSQL
// Supported is false: backups are managed outside the API (pg_dump).
type PlatformBackupStatus struct {
	Supported       bool    `json:"supported"`
	LastBackupAt    *string `json:"lastBackupAt"`
	Stale           bool    `json:"stale"`
	StaleAfterHours int     `json:"staleAfterHours"`
	// IntervalSeconds is the automatic backup interval; 0 when off.
	IntervalSeconds int64 `json:"intervalSeconds"`
}

// PlatformBackup is one backup copy (listed only, never downloadable).
type PlatformBackup struct {
	Name      string `json:"name"`
	SizeBytes int64  `json:"sizeBytes"`
	CreatedAt string `json:"createdAt"`
}

// PlatformBackups is GET /platform/backups: the status, where copies go and
// the newest copies (at most 50; Total counts all).
type PlatformBackups struct {
	PlatformBackupStatus
	Engine    string           `json:"engine"`
	Directory string           `json:"directory"`
	Keep      int              `json:"keep"`
	Total     int              `json:"total"`
	Items     []PlatformBackup `json:"items"`
}

type PlatformTenantMetrics struct {
	ID                 string         `json:"id"`
	Slug               string         `json:"slug"`
	Name               string         `json:"name"`
	CreatedAt          string         `json:"createdAt"`
	Users              int            `json:"users"`
	Admins             int            `json:"admins"`
	Customers          int            `json:"customers"`
	CatalogItems       int            `json:"catalogItems"`
	WorkOrders         int            `json:"workOrders"`
	WorkOrdersInRange  int            `json:"workOrdersInRange"`
	OpenWorkOrders     int            `json:"openWorkOrders"`
	StatusCounts       map[string]int `json:"statusCounts"`
	LoginsInRange      int            `json:"loginsInRange"`
	ActiveUsersInRange int            `json:"activeUsersInRange"`
	ActiveSessions     int            `json:"activeSessions"`
	LastWorkOrderAt    *string        `json:"lastWorkOrderAt"`
	LastLoginAt        *string        `json:"lastLoginAt"`
	HasLoginLogo       bool           `json:"hasLoginLogo"`
}

// PlatformDailyPoint is one day of the dashboard's time series, keyed by
// organization slug.
type PlatformDailyPoint struct {
	Date       string         `json:"date"`
	WorkOrders map[string]int `json:"workOrders"`
	Logins     map[string]int `json:"logins"`
}

type User struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Role     UserRole `json:"role"`
	// TenantID is the owning organization. It is populated server-side (from the
	// session/authentication) and used to scope every data query; it is never
	// exposed to clients.
	TenantID string `json:"-"`
	// ImpersonatedBy is set only on a session a Backoffice superadmin opened
	// "as" this user: it names that superadmin, so the app can say so.
	ImpersonatedBy *string `json:"impersonatedBy,omitempty"`
	// ImpersonationID links an impersonated session to its audit row, so every
	// change made in it is traced back (server-side only; 0 otherwise).
	ImpersonationID int64 `json:"-"`
	// TenantSuspended blocks every ordinary session of a suspended
	// organization; impersonation still works (server-side only).
	TenantSuspended bool `json:"-"`
}

// Tenant is an organization (shop) whose data is isolated from every other
// tenant. Users log in by first supplying their tenant's slug.
type Tenant struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
	// Suspended organizations cannot sign in (server-side only).
	Suspended bool `json:"-"`
}

// CreateUserInput is the payload an admin submits to add a user account.
type CreateUserInput struct {
	Username string   `json:"username"`
	Password string   `json:"password"`
	Role     UserRole `json:"role"`
}

// UpdateUserInput edits an existing account. Role changes the privilege level;
// a non-empty Password resets the password (empty leaves it unchanged).
type UpdateUserInput struct {
	Role     UserRole `json:"role"`
	Password string   `json:"password"`
}

type FixtureUser struct {
	// Embedding User keeps the API-facing fields together while adding the
	// password field needed only for fixture-backed authentication.
	User
	Password string `json:"password"`
}

type JobDetails struct {
	ProductCode    *string `json:"productCode"`
	PaperWeightGsm *int    `json:"paperWeightGsm"`
	Dimensions     *string `json:"dimensions"`
	Quantity       *int    `json:"quantity"`
	FinishingNote  *string `json:"finishingNote"`
}

type Shipping struct {
	DeliveryMethod     *DeliveryMethod     `json:"deliveryMethod"`
	DrivesOut          bool                `json:"drivesOut"`
	PostagePaymentType *PostagePaymentType `json:"postagePaymentType"`
	WaitForPayment     bool                `json:"waitForPayment"`
	HasPackaging       bool                `json:"hasPackaging"`
	HasLabeling        bool                `json:"hasLabeling"`
	IsFragile          bool                `json:"isFragile"`
	RequiresSignature  bool                `json:"requiresSignature"`
	HasInsurance       bool                `json:"hasInsurance"`
	ShippingAddress    *string             `json:"shippingAddress"`
}

type Customer struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	ContactName *string `json:"contactName"`
	Email       *string `json:"email"`
	Phone       *string `json:"phone"`
	// Pib (poreski identifikacioni broj) and Mb (matični broj) identify a
	// Serbian firm. They are optional on imported/legacy records but validated
	// whenever present; see internal/domain/validation.go.
	Pib *string `json:"pib"`
	Mb  *string `json:"mb"`
	// Emails and Contacts are 1-N child collections persisted in their own
	// tables. The legacy single Email/ContactName/Phone fields above are kept
	// for back-compat and seeded into these collections by migration. Always
	// serialized as arrays (never null); see internal/store.
	Emails   []CustomerEmail   `json:"emails"`
	Contacts []CustomerContact `json:"contacts"`
}

// CustomerEmail is one of a firm's corporate email addresses. Label is an
// optional free-text tag (e.g. "Računovodstvo").
type CustomerEmail struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Label     *string `json:"label"`
	SortOrder int     `json:"sortOrder"`
}

// CustomerContact is one of a firm's contact people, with their own optional
// email and phone.
type CustomerContact struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Role      *string `json:"role"`
	SortOrder int     `json:"sortOrder"`
}

type Location struct {
	ID         string  `json:"id"`
	CustomerID string  `json:"customerId"`
	Name       string  `json:"name"`
	Address    *string `json:"address"`
}

type Assignment struct {
	AssignedTo *string           `json:"assignedTo"`
	Priority   WorkOrderPriority `json:"priority"`
}

type WorkOrderStatusHistory struct {
	Status    WorkOrderStatus `json:"status"`
	ChangedAt string          `json:"changedAt"`
	ChangedBy string          `json:"changedBy"`
}

type Attachment struct {
	ID         string  `json:"id"`
	FileName   string  `json:"fileName"`
	FileType   string  `json:"fileType"`
	URL        *string `json:"url"`
	UploadedAt string  `json:"uploadedAt"`
}

type WorkOrderNote struct {
	ID         string                  `json:"id"`
	Visibility WorkOrderNoteVisibility `json:"visibility"`
	Author     string                  `json:"author"`
	Body       string                  `json:"body"`
	CreatedAt  string                  `json:"createdAt"`
}

type WorkOrderEvent struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Label     string `json:"label"`
	Actor     string `json:"actor"`
	CreatedAt string `json:"createdAt"`
}

type MaterialUsage struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Quantity int      `json:"quantity"`
	Unit     string   `json:"unit"`
	UnitCost *float64 `json:"unitCost"`
}

type TimeEntry struct {
	ID       string `json:"id"`
	Operator string `json:"operator"`
	Minutes  int    `json:"minutes"`
	LoggedAt string `json:"loggedAt"`
}

type InvoiceLineItem struct {
	ID          string              `json:"id"`
	Kind        InvoiceLineItemKind `json:"kind"`
	Description string              `json:"description"`
	// Quantity is a float so services billed by area or length (e.g. 1.5 m²)
	// can be entered directly. Piece-count lines simply carry a whole number.
	Quantity float64     `json:"quantity"`
	Unit     InvoiceUnit `json:"unit"`
	// UnitPrice is the selling price per unit (prodajna cena) — what the customer
	// is charged. Visible to every role, on screen and on the printed nalog.
	UnitPrice float64 `json:"unitPrice"`
	// UnitCost is the per-unit cost frozen onto the line when the order is saved:
	// for catalog lines the catalog cost in effect at the issue date (re-snapshot
	// to the completion date when the order completes), for ad-hoc lines a value
	// an admin enters by hand. nil means "cost not yet captured" (an ad-hoc line
	// awaiting admin review, or a catalog item with no known cost) — distinct from
	// a genuine zero. Admin-only: stripped from non-admin responses. Margin per
	// unit = UnitPrice-UnitCost.
	UnitCost *float64 `json:"unitCost"`
	// CatalogItemID links the line back to a CatalogItem when the user picked one
	// from the catalog. It is nil for ad-hoc ("special") services typed inline.
	CatalogItemID *string `json:"catalogItemId,omitempty"`
}

type InvoiceDraft struct {
	Status        InvoiceDraftStatus `json:"status"`
	InvoiceNumber *string            `json:"invoiceNumber"`
	LineItems     []InvoiceLineItem  `json:"lineItems"`
	PaidAt        *string            `json:"paidAt"`
}

type CustomerCommunication struct {
	PublicToken               string  `json:"publicToken"`
	NotificationEmail         *string `json:"notificationEmail"`
	EmailNotificationsEnabled bool    `json:"emailNotificationsEnabled"`
	SignedBy                  *string `json:"signedBy"`
	SignedAt                  *string `json:"signedAt"`
}

type WorkOrder struct {
	ID                    string               `json:"id"`
	OrderNumber           string               `json:"orderNumber"`
	CustomerID            *string              `json:"customerId"`
	LocationID            *string              `json:"locationId"`
	ClientName            string               `json:"clientName"`
	ContactPerson         *string              `json:"contactPerson"`
	JobDescription        string               `json:"jobDescription"`
	JobDetails            *JobDetails          `json:"jobDetails"`
	BillingDocumentType   *BillingDocumentType `json:"billingDocumentType"`
	BillingDocumentNumber *string              `json:"billingDocumentNumber"`
	Shipping              Shipping             `json:"shipping"`
	IssuedBy              string               `json:"issuedBy"`
	ExecutedBy            *string              `json:"executedBy"`
	Assignment            Assignment           `json:"assignment"`
	IssueDate             string               `json:"issueDate"`
	// ProformaDueDate is the deadline to issue the proforma invoice (predračun);
	// DueDate is the deadline to finish the job.
	ProformaDueDate *string `json:"proformaDueDate"`
	DueDate         *string `json:"dueDate"`
	IsCompleted     bool    `json:"isCompleted"`
	// IsPaid marks the job as paid for (plaćeno). It is independent of
	// BillingDocumentType — a proforma or cash-collection order can be paid just
	// as an invoiced one can — and of InvoiceDraft.Status, which tracks the
	// invoice document's own lifecycle and is advanced by the server.
	IsPaid bool            `json:"isPaid"`
	Status WorkOrderStatus `json:"status"`
	Price  *float64        `json:"price"`
	// Profit is the cached margin (sum of (unitPrice-unitCost)*qty over line
	// items with a captured cost), recomputed server-side on every save.
	// Admin-only: stripped from responses to non-admin users alongside per-line
	// UnitCost. Provisional while NeedsCostReview is true.
	Profit *float64 `json:"profit,omitempty"`
	// NeedsCostReview is true when any line item has no captured cost
	// (UnitCost == nil) — typically ad-hoc lines an operator added. Such orders
	// are not blocked: they save, raise a cost_review event, and surface in the
	// admin review queue until an admin enters the missing costs. Admin-only.
	NeedsCostReview bool                     `json:"needsCostReview"`
	Note            *string                  `json:"note"`
	CreatedAt       string                   `json:"createdAt"`
	UpdatedAt       string                   `json:"updatedAt"`
	CompletionDate  *string                  `json:"completionDate"`
	StatusHistory   []WorkOrderStatusHistory `json:"statusHistory"`
	InternalNotes   []WorkOrderNote          `json:"internalNotes"`
	CustomerNotes   []WorkOrderNote          `json:"customerNotes"`
	Events          []WorkOrderEvent         `json:"events"`
	Attachments     []Attachment             `json:"attachments"`
	MaterialUsage   []MaterialUsage          `json:"materialUsage"`
	TimeEntries     []TimeEntry              `json:"timeEntries"`
	InvoiceDraft    InvoiceDraft             `json:"invoiceDraft"`
	Communication   CustomerCommunication    `json:"communication"`
}

type CreateWorkOrderInput struct {
	// OrderNumber, when set, is a number previously handed out by
	// ReserveOrderNumber and shown in the create-form header. The store consumes
	// it if the reservation is still valid, otherwise it allocates a fresh one.
	OrderNumber           *string               `json:"orderNumber"`
	CustomerID            *string               `json:"customerId"`
	LocationID            *string               `json:"locationId"`
	ClientName            string                `json:"clientName"`
	ContactPerson         *string               `json:"contactPerson"`
	JobDescription        string                `json:"jobDescription"`
	JobDetails            *JobDetails           `json:"jobDetails"`
	BillingDocumentType   *BillingDocumentType  `json:"billingDocumentType"`
	BillingDocumentNumber *string               `json:"billingDocumentNumber"`
	Shipping              Shipping              `json:"shipping"`
	Assignment            Assignment            `json:"assignment"`
	IssuedBy              string                `json:"issuedBy"`
	ExecutedBy            *string               `json:"executedBy"`
	IssueDate             string                `json:"issueDate"`
	ProformaDueDate       *string               `json:"proformaDueDate"`
	DueDate               *string               `json:"dueDate"`
	IsPaid                bool                  `json:"isPaid"`
	Price                 *float64              `json:"price"`
	Note                  *string               `json:"note"`
	InternalNotes         []WorkOrderNote       `json:"internalNotes"`
	CustomerNotes         []WorkOrderNote       `json:"customerNotes"`
	Attachments           []Attachment          `json:"attachments"`
	MaterialUsage         []MaterialUsage       `json:"materialUsage"`
	TimeEntries           []TimeEntry           `json:"timeEntries"`
	InvoiceDraft          InvoiceDraft          `json:"invoiceDraft"`
	Communication         CustomerCommunication `json:"communication"`
}

type UpdateWorkOrderInput map[string]json.RawMessage

type LoginRequest struct {
	OrgSlug  string `json:"orgSlug"`
	Username string `json:"username"`
	Password string `json:"password"`
	// Remember asks to stay signed in on this device: a persistent cookie and
	// the longer session lifetimes (7 days idle, 30 days at most) instead of a
	// browser-session cookie (12 hours idle, 24 hours at most).
	Remember bool `json:"remember,omitempty"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	User    *User  `json:"user,omitempty"`
}

// ReservedOrderNumber is the response for reserving the next order number before
// a work order is created, so the operator can see it in the create-form header.
type ReservedOrderNumber struct {
	OrderNumber string `json:"orderNumber"`
	ExpiresAt   string `json:"expiresAt"`
}

// EditLock represents an exclusive editing claim on a work order so only one
// operator edits it at a time. LockedBy is the holder's username. A lock
// auto-expires at ExpiresAt if the holder stops sending heartbeats (e.g. their
// tab was closed).
type EditLock struct {
	WorkOrderID string `json:"workOrderId"`
	LockedBy    string `json:"lockedBy"`
	LockedAt    string `json:"lockedAt"`
	ExpiresAt   string `json:"expiresAt"`
}

type DeleteWorkOrderResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

type PublicWorkOrderStatus struct {
	OrderNumber       string          `json:"orderNumber"`
	ClientName        string          `json:"clientName"`
	JobDescription    string          `json:"jobDescription"`
	Status            WorkOrderStatus `json:"status"`
	DueDate           *string         `json:"dueDate"`
	CustomerNoteCount int             `json:"customerNoteCount"`
	InternalNoteCount int             `json:"internalNoteCount"`
	SignedBy          *string         `json:"signedBy"`
	SignedAt          *string         `json:"signedAt"`
}

// ---------------------------------------------------------------------------
// Dashboard (GET /dashboard) — server-side aggregation. Field names mirror the
// web client's dashboard shapes so the client can consume them unchanged.
// ---------------------------------------------------------------------------

// DashboardSummary is the filtered-order headline: count per status and the
// summed order price.
type DashboardSummary struct {
	TotalOrders int `json:"totalOrders"`
	// StatusCounts carries every canonical status key, 0 by default.
	StatusCounts map[WorkOrderStatus]int `json:"statusCounts"`
	TotalRevenue float64                 `json:"totalRevenue"`
}

type DashboardMonthlyBucket struct {
	Month   string  `json:"month"`
	Count   int     `json:"count"`
	Revenue float64 `json:"revenue"`
}

type DashboardDeliveryCount struct {
	Method DeliveryMethod `json:"method"`
	Count  int            `json:"count"`
}

type DashboardClientCount struct {
	ClientName string `json:"clientName"`
	Count      int    `json:"count"`
}

type DashboardProfitTotals struct {
	Service float64 `json:"service"`
	Article float64 `json:"article"`
	Total   float64 `json:"total"`
}

type DashboardMonthlyProfit struct {
	Month   string  `json:"month"`
	Service float64 `json:"service"`
	Article float64 `json:"article"`
	Total   float64 `json:"total"`
}

type DashboardCompanyProfit struct {
	GroupKey      string  `json:"groupKey"`
	CustomerID    *string `json:"customerId"`
	Name          string  `json:"name"`
	Profit        float64 `json:"profit"`
	ServiceProfit float64 `json:"serviceProfit"`
	ArticleProfit float64 `json:"articleProfit"`
	Revenue       float64 `json:"revenue"`
	OrderCount    int     `json:"orderCount"`
}

type DashboardItemProfit struct {
	GroupKey      string              `json:"groupKey"`
	CatalogItemID *string             `json:"catalogItemId"`
	Name          string              `json:"name"`
	Kind          InvoiceLineItemKind `json:"kind"`
	Profit        float64             `json:"profit"`
	Revenue       float64             `json:"revenue"`
	Quantity      float64             `json:"quantity"`
}

type DashboardItemProfitBreakdown struct {
	Services []DashboardItemProfit `json:"services"`
	Articles []DashboardItemProfit `json:"articles"`
}

// DashboardFinance is cost-derived and therefore admin-only; it is null for
// every other role.
type DashboardFinance struct {
	ProfitTotals  DashboardProfitTotals        `json:"profitTotals"`
	Revenue       float64                      `json:"revenue"`
	MonthlyProfit []DashboardMonthlyProfit     `json:"monthlyProfit"`
	CompanyProfit []DashboardCompanyProfit     `json:"companyProfit"`
	ItemProfit    DashboardItemProfitBreakdown `json:"itemProfit"`
}

type DashboardSignalCounts struct {
	Overdue     int `json:"overdue"`
	DueToday    int `json:"dueToday"`
	DueThisWeek int `json:"dueThisWeek"`
	Unassigned  int `json:"unassigned"`
}

// DashboardAttentionOrder is the slim order projection shown in attention lists.
type DashboardAttentionOrder struct {
	ID             string          `json:"id"`
	OrderNumber    string          `json:"orderNumber"`
	JobDescription string          `json:"jobDescription"`
	Status         WorkOrderStatus `json:"status"`
	DueDate        *string         `json:"dueDate"`
}

type DashboardAttentionRow struct {
	GroupKey    string                    `json:"groupKey"`
	CustomerID  *string                   `json:"customerId"`
	DisplayName string                    `json:"displayName"`
	Counts      DashboardSignalCounts     `json:"counts"`
	Severity    float64                   `json:"severity"`
	Orders      []DashboardAttentionOrder `json:"orders"`
}

type DashboardQueueSummary struct {
	Today      int `json:"today"`
	Overdue    int `json:"overdue"`
	Unassigned int `json:"unassigned"`
}

type DashboardOperatorQueue struct {
	AssignedToMe int `json:"assignedToMe"`
	DueToday     int `json:"dueToday"`
	Overdue      int `json:"overdue"`
	InProgress   int `json:"inProgress"`
	Available    int `json:"available"`
}

// DashboardData is the GET /dashboard response.
type DashboardData struct {
	// HasOrders reports whether the tenant has any work order at all,
	// independent of the filters, so clients can tell "no data yet" from
	// "nothing matches the filters".
	HasOrders             bool                     `json:"hasOrders"`
	Summary               DashboardSummary         `json:"summary"`
	MonthlyBuckets        []DashboardMonthlyBucket `json:"monthlyBuckets"`
	DeliveryDistribution  []DashboardDeliveryCount `json:"deliveryDistribution"`
	TopClients            []DashboardClientCount   `json:"topClients"`
	Finance               *DashboardFinance        `json:"finance"`
	SignalCounts          DashboardSignalCounts    `json:"signalCounts"`
	ClientAttentionRows   []DashboardAttentionRow  `json:"clientAttentionRows"`
	InternalAttentionRows []DashboardAttentionRow  `json:"internalAttentionRows"`
	QueueSummary          DashboardQueueSummary    `json:"queueSummary"`
	OperatorQueue         DashboardOperatorQueue   `json:"operatorQueue"`
}

// ProcessNodeKind is the role a node plays in a process graph.
type ProcessNodeKind string

const (
	ProcessNodeStep      ProcessNodeKind = "step"
	ProcessNodeInput     ProcessNodeKind = "input"
	ProcessNodeProduct   ProcessNodeKind = "product"
	ProcessNodeByproduct ProcessNodeKind = "byproduct"
)

// ProcessStepStatus is the per-work-order progress of a step node.
type ProcessStepStatus string

const (
	ProcessStepPending    ProcessStepStatus = "pending"
	ProcessStepInProgress ProcessStepStatus = "in_progress"
	ProcessStepDone       ProcessStepStatus = "done"
	ProcessStepSkipped    ProcessStepStatus = "skipped"
)

// ProcessNode is one vertex of a process graph. Step nodes carry Status; item
// nodes (input, product, byproduct) carry the quantity fields.
type ProcessNode struct {
	ID             string            `json:"id"`
	Kind           ProcessNodeKind   `json:"kind"`
	Label          string            `json:"label"`
	X              float64           `json:"x"`
	Y              float64           `json:"y"`
	Quantity       *float64          `json:"quantity,omitempty"`
	Unit           string            `json:"unit,omitempty"`
	CatalogItemID  string            `json:"catalogItemId,omitempty"`
	Note           string            `json:"note,omitempty"`
	Status         ProcessStepStatus `json:"status,omitempty"`
	ActualQuantity *float64          `json:"actualQuantity,omitempty"`
}

// ProcessEdge is a directed connection between two process nodes.
type ProcessEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label,omitempty"`
}

// ProcessGraph is the directed acyclic graph of a process.
type ProcessGraph struct {
	Nodes []ProcessNode `json:"nodes"`
	Edges []ProcessEdge `json:"edges"`
}

// ProcessTemplate is a tenant-defined reusable process graph.
type ProcessTemplate struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	IsDefault   bool         `json:"isDefault"`
	Graph       ProcessGraph `json:"graph"`
	CreatedAt   string       `json:"createdAt"`
	UpdatedAt   string       `json:"updatedAt"`
}

// ProcessTemplateInput is the create/update payload for a process template.
type ProcessTemplateInput struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	IsDefault   bool         `json:"isDefault"`
	Graph       ProcessGraph `json:"graph"`
}

// WorkOrderProcess is a work order's own copy of a process graph plus its
// per-order state. TemplateID is nil once the source template is deleted.
type WorkOrderProcess struct {
	WorkOrderID  string       `json:"workOrderId"`
	TemplateID   *string      `json:"templateId"`
	TemplateName string       `json:"templateName"`
	Graph        ProcessGraph `json:"graph"`
	UpdatedAt    string       `json:"updatedAt"`
	UpdatedBy    string       `json:"updatedBy"`
}

// ApplyProcessTemplateInput attaches a template to a work order.
type ApplyProcessTemplateInput struct {
	TemplateID string `json:"templateId"`
}

// WorkOrderProcessInput replaces a work order's process graph.
type WorkOrderProcessInput struct {
	Graph ProcessGraph `json:"graph"`
}

// Backoffice audit actions for process templates.
const (
	AuditProcessTemplateCreate = "process_template.create"
	AuditProcessTemplateUpdate = "process_template.update"
	AuditProcessTemplateDelete = "process_template.delete"
)
