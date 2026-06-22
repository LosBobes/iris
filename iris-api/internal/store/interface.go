package store

import (
	"context"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

type WorkOrderListQuery struct {
	Search     string
	Status     domain.WorkOrderStatus
	AssignedTo string
	DateFrom   string
	DateTo     string
	Limit      int
	Offset     int
	Sort       string
}

type WorkOrderListResult struct {
	Items []domain.WorkOrder `json:"items"`
	Total int                `json:"total"`
}

type Store interface {
	AuthenticateUser(ctx context.Context, username string, password string) (*domain.User, error)
	CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error)
	UserBySessionToken(ctx context.Context, token string) (*domain.User, error)
	DeleteSession(ctx context.Context, token string) error

	Customers(ctx context.Context) ([]domain.Customer, error)
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
}
