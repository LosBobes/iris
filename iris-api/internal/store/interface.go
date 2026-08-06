package store

import (
	"context"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

type WorkOrderListQuery struct {
	Search          string
	Status          domain.WorkOrderStatus
	AssignedTo      string
	DateFrom        string
	DateTo          string
	NeedsCostReview bool
	Limit           int
	Offset          int
	Sort            string
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
	CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error)
	UserBySessionToken(ctx context.Context, token string) (*domain.User, error)
	DeleteSession(ctx context.Context, token string) error

	Customers(ctx context.Context, query CustomerQuery) (CustomerListResult, error)
	CustomerByID(ctx context.Context, id string) (*domain.Customer, error)
	// Locations returns customer locations for the tenant. When customerID is
	// non-empty, only that customer's locations are returned; empty returns all.
	Locations(ctx context.Context, customerID string) ([]domain.Location, error)
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
	UpdateOrganizationSettings(ctx context.Context, update domain.OrganizationSettingsUpdate) (domain.OrganizationSettings, error)

	ListUsers(ctx context.Context) ([]domain.User, error)
	UserByID(ctx context.Context, id string) (*domain.User, error)
	CreateUserAccount(ctx context.Context, input domain.CreateUserInput) (*domain.User, error)
	UpdateUserAccount(ctx context.Context, id string, input domain.UpdateUserInput) (*domain.User, error)
	DeleteUser(ctx context.Context, id string) error
}
