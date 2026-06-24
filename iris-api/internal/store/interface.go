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
	AuthenticateUser(ctx context.Context, username string, password string) (*domain.User, error)
	CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error)
	UserBySessionToken(ctx context.Context, token string) (*domain.User, error)
	DeleteSession(ctx context.Context, token string) error

	Customers(ctx context.Context, query CustomerQuery) (CustomerListResult, error)
	CustomerByID(ctx context.Context, id string) (*domain.Customer, error)
	Locations(ctx context.Context) ([]domain.Location, error)
	UpsertCustomer(ctx context.Context, customer domain.Customer) (*domain.Customer, error)
	UpsertLocation(ctx context.Context, location domain.Location) (*domain.Location, error)
	DeleteCustomer(ctx context.Context, id string) error
	DeleteLocation(ctx context.Context, id string) error

	WorkOrders(ctx context.Context, query WorkOrderListQuery) (WorkOrderListResult, error)
	WorkOrderByID(ctx context.Context, id string) (*domain.WorkOrder, error)
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
	UpsertCatalogItem(ctx context.Context, item domain.CatalogItem) (*domain.CatalogItem, error)
	DeleteCatalogItem(ctx context.Context, id string) error

	OrganizationSettings(ctx context.Context) (domain.OrganizationSettings, error)
	UpdateOrganizationSettings(ctx context.Context, settings domain.OrganizationSettings) (domain.OrganizationSettings, error)

	ListUsers(ctx context.Context) ([]domain.User, error)
	UserByID(ctx context.Context, id string) (*domain.User, error)
	CreateUserAccount(ctx context.Context, input domain.CreateUserInput) (*domain.User, error)
	UpdateUserAccount(ctx context.Context, id string, input domain.UpdateUserInput) (*domain.User, error)
	DeleteUser(ctx context.Context, id string) error
}
