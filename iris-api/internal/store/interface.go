package store

import (
	"context"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// WorkOrderListQuery filters, sorts and pages the work-order list. Empty
// fields mean "no filter"; Limit <= 0 means "no limit" (internal callers such
// as the dashboard and the CSV export read every match — the HTTP list handler
// always sets a capped limit).
type WorkOrderListQuery struct {
	// Search is matched, diacritic-folded, against the search_text haystack.
	Search              string
	Status              domain.WorkOrderStatus
	AssignedTo          string
	CustomerID          string
	BillingDocumentType string
	DeliveryMethod      string
	// Queue is one of the WorkOrderQueue* buckets (or empty); Today is the
	// caller's local YYYY-MM-DD for the due-date buckets (default: UTC today).
	Queue           string
	Today           string
	DateFrom        string
	DateTo          string
	NeedsCostReview bool
	Limit           int
	Offset          int
	Sort            string
	// Summary selects the slim list projection (no history collections).
	Summary bool
}

type WorkOrderListResult struct {
	Items []domain.WorkOrder `json:"items"`
	Total int                `json:"total"`
}

// CatalogItemQuery filters and paginates the catalog list. Empty filter fields
// mean "no filter"; Limit <= 0 means "no limit" (return all matches).
type CatalogItemQuery struct {
	Kind       domain.CatalogItemKind
	Search     string
	ActiveOnly bool
	Limit      int
	Offset     int
	// IDs, when non-empty, restricts results to these catalog item ids (batch
	// lookup). Ids from another tenant are never returned.
	IDs []string
}

// CatalogCleanupMissing names which price a catalog item must be missing to be
// swept by the admin cleanup.
type CatalogCleanupMissing string

const (
	// CleanupMissingPurchase matches items with no purchase (input) price, whether
	// or not they have a sale price.
	CleanupMissingPurchase CatalogCleanupMissing = "purchase"
	// CleanupMissingSale matches items with no sale (output) price, whether or not
	// they have a purchase price.
	CleanupMissingSale CatalogCleanupMissing = "sale"
	// CleanupMissingBoth matches only items with neither price — the narrowest,
	// safest sweep.
	CleanupMissingBoth CatalogCleanupMissing = "both"
)

// CatalogCleanupFilter scopes the admin catalog cleanup on two axes: which kinds
// of item are in scope, and which price has to be missing. An empty Kinds slice
// matches nothing, so a mis-built filter deletes nothing rather than everything.
type CatalogCleanupFilter struct {
	Kinds   []domain.CatalogItemKind
	Missing CatalogCleanupMissing
}

// CatalogItemListResult is a page of catalog items plus the total match count.
type CatalogItemListResult struct {
	Items []domain.CatalogItem `json:"items"`
	Total int                  `json:"total"`
}

// CustomerQuery filters and paginates the customer list. Limit <= 0 means "no
// limit" (return all matches).
type CustomerQuery struct {
	Search string
	Limit  int
	Offset int
}

// CustomerListResult is a page of customers plus the total match count.
type CustomerListResult struct {
	Items []domain.Customer `json:"items"`
	Total int               `json:"total"`
}

type Store interface {
	TenantBySlug(ctx context.Context, slug string) (*domain.Tenant, error)
	AuthenticateUser(ctx context.Context, tenantID string, username string, password string) (*domain.User, error)
	// CreateSession starts a session with a fixed expiry (never extended);
	// StartSession is the sign-in path with a sliding expiry under a cap.
	CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error)
	StartSession(ctx context.Context, input NewSession) (string, error)
	UserBySessionToken(ctx context.Context, token string) (*domain.User, error)
	SessionByToken(ctx context.Context, token string) (*Session, error)
	// ExtendSession slides an ordinary session's idle expiry forward, never
	// past its absolute expiry.
	ExtendSession(ctx context.Context, token string, expiresAt time.Time) error
	DeleteSession(ctx context.Context, token string) error
	// EndUserSessions ends every session of a user (in the context tenant)
	// except the one behind exceptToken ("" ends all).
	EndUserSessions(ctx context.Context, userID string, exceptToken string) error

	Customers(ctx context.Context, query CustomerQuery) (CustomerListResult, error)
	CustomerByID(ctx context.Context, id string) (*domain.Customer, error)
	// Locations returns customer locations for the tenant. When customerID is
	// non-empty, only that customer's locations are returned; empty returns all.
	Locations(ctx context.Context, customerID string) ([]domain.Location, error)
	// LocationByID returns one location of the tenant, or nil when it does not
	// exist. A non-empty customerID additionally requires the location to belong
	// to that customer (mirroring Locations(customerID)).
	LocationByID(ctx context.Context, customerID, id string) (*domain.Location, error)
	// DashboardOrders returns the (pruned) work orders the dashboard aggregates.
	DashboardOrders(ctx context.Context, query DashboardOrdersQuery) (DashboardOrders, error)
	UpsertCustomer(ctx context.Context, customer domain.Customer) (*domain.Customer, error)
	UpsertLocation(ctx context.Context, location domain.Location) (*domain.Location, error)
	DeleteCustomer(ctx context.Context, id string) error
	DeleteLocation(ctx context.Context, id string) error

	WorkOrders(ctx context.Context, query WorkOrderListQuery) (WorkOrderListResult, error)
	WorkOrderByID(ctx context.Context, id string) (*domain.WorkOrder, error)
	WorkOrderByPublicToken(ctx context.Context, token string) (*domain.WorkOrder, error)
	ReserveOrderNumber(ctx context.Context, reservedBy string) (domain.ReservedOrderNumber, error)
	// ReleaseOrderNumber drops a still-active reservation so its number is
	// reclaimed immediately when an operator cancels the create form instead of
	// waiting for the reservation to expire. Releasing an unknown/already-consumed
	// number is a no-op.
	ReleaseOrderNumber(ctx context.Context, orderNumber string) error
	// AcquireEditLock claims or refreshes the exclusive edit lock on a work order
	// for lockedBy. It returns (lock, true) when the caller holds the lock (freshly
	// acquired or heartbeat-refreshed) and (holderLock, false) when another operator
	// currently holds an unexpired lock.
	AcquireEditLock(ctx context.Context, workOrderID, lockedBy string) (domain.EditLock, bool, error)
	// ReleaseEditLock frees the caller's edit lock on a work order. It only removes
	// the lock when lockedBy still holds it, so a stale caller can't drop the lock a
	// new holder has since taken. Releasing a lock you don't hold is a no-op.
	ReleaseEditLock(ctx context.Context, workOrderID, lockedBy string) error
	CreateWorkOrder(ctx context.Context, input domain.CreateWorkOrderInput) (*domain.WorkOrder, error)
	UpdateWorkOrder(ctx context.Context, id string, changes domain.UpdateWorkOrderInput) (*domain.WorkOrder, error)
	DeleteWorkOrder(ctx context.Context, id string) (domain.DeleteWorkOrderResponse, error)
	Operators(ctx context.Context) ([]string, error)

	EnumValues(ctx context.Context) ([]domain.EnumValue, error)
	CreateEnumValue(ctx context.Context, input domain.EnumValueInput) (*domain.EnumValue, error)
	UpdateEnumValue(ctx context.Context, id string, input domain.EnumValueInput) (*domain.EnumValue, error)
	DeleteEnumValue(ctx context.Context, id string) error

	CatalogItems(ctx context.Context, query CatalogItemQuery) (CatalogItemListResult, error)
	CatalogItemByID(ctx context.Context, id string) (*domain.CatalogItem, error)
	CatalogItemCostHistory(ctx context.Context, catalogItemID string) ([]domain.CatalogItemCost, error)
	UpsertCatalogItem(ctx context.Context, item domain.CatalogItem, effectiveFrom string) (*domain.CatalogItem, error)
	DeleteCatalogItem(ctx context.Context, id string) error
	// CatalogItemsMissingPrices lists the catalog items matching a cleanup filter
	// (which kinds, and which price is missing) — the preview an admin confirms
	// before anything is deleted.
	CatalogItemsMissingPrices(ctx context.Context, filter CatalogCleanupFilter) ([]domain.CatalogItem, error)
	// DeleteCatalogItemsMissingPrices removes the catalog items
	// CatalogItemsMissingPrices reports for the same filter, returning how many
	// were deleted.
	DeleteCatalogItemsMissingPrices(ctx context.Context, filter CatalogCleanupFilter) (int, error)

	OrganizationSettings(ctx context.Context) (domain.OrganizationSettings, error)
	// OrganizationModules returns the optional modules (processes, stock) of the
	// tenant in ctx; both are off unless a Backoffice superadmin switched them on.
	OrganizationModules(ctx context.Context) (domain.OrganizationModules, error)
	UpdateOrganizationSettings(ctx context.Context, update domain.OrganizationSettingsUpdate) (domain.OrganizationSettings, error)
	// LoginLogo returns the tenant's sign-in logo, or nil when none is set.
	LoginLogo(ctx context.Context) (*domain.LoginLogo, error)
	// SetLoginLogo validates and stores the tenant's sign-in logo.
	SetLoginLogo(ctx context.Context, upload domain.LoginLogoUpload) (*domain.LoginLogo, error)
	// DeleteLoginLogo removes the tenant's sign-in logo (a no-op when unset).
	DeleteLoginLogo(ctx context.Context) error

	// Process templates (tenant-defined process graphs) and each work order's own
	// copy. ProcessTemplateByID and WorkOrderProcess return nil when missing;
	// the write methods return the sentinel errors in process_graph.go
	// (ErrProcessTemplateNotFound, ErrWorkOrderNotFound, ErrProcessExists,
	// ErrProcessStructureLocked, ErrProcessNotFound).
	ProcessTemplates(ctx context.Context) ([]domain.ProcessTemplate, error)
	ProcessTemplateByID(ctx context.Context, id string) (*domain.ProcessTemplate, error)
	CreateProcessTemplate(ctx context.Context, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error)
	UpdateProcessTemplate(ctx context.Context, id string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error)
	DeleteProcessTemplate(ctx context.Context, id string) error
	WorkOrderProcess(ctx context.Context, workOrderID string) (*domain.WorkOrderProcess, error)
	ApplyProcessTemplate(ctx context.Context, workOrderID, templateID, username string) (*domain.WorkOrderProcess, error)
	// UpdateWorkOrderProcess replaces the graph; without allowStructural only
	// per-order state and positions may change (else ErrProcessStructureLocked).
	// It returns nil when the order has no process.
	UpdateWorkOrderProcess(ctx context.Context, workOrderID string, graph domain.ProcessGraph, username string, allowStructural bool) (*domain.WorkOrderProcess, error)
	DeleteWorkOrderProcess(ctx context.Context, workOrderID string) error

	// Warehouse stock (magacin). StockLevels/StockMovements are read-only views of
	// the movement ledger; the Post* methods append movements in one transaction
	// and return *ValidationError (422) for unknown articles, services, bad
	// quantities and duplicate lines. Work-order process writes post their own
	// consumption/production movements (see domain.PlanStockPostings).
	StockLevels(ctx context.Context, query StockLevelQuery) (domain.StockLevelList, error)
	StockMovements(ctx context.Context, query StockMovementQuery) (domain.StockMovementList, error)
	PostStockReceipt(ctx context.Context, input domain.StockReceiptInput, username string) (domain.StockPostingResult, error)
	PostStockCount(ctx context.Context, input domain.StockCountInput, username string) (domain.StockPostingResult, error)

	ListUsers(ctx context.Context) ([]domain.User, error)
	UserByID(ctx context.Context, id string) (*domain.User, error)
	CreateUserAccount(ctx context.Context, input domain.CreateUserInput) (*domain.User, error)
	UpdateUserAccount(ctx context.Context, id string, input domain.UpdateUserInput) (*domain.User, error)
	DeleteUser(ctx context.Context, id string) error
}
