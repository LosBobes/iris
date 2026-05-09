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

type BillingDocumentType string

const (
	BillingDocumentTypeInvoice        BillingDocumentType = "invoice"
	BillingDocumentTypeCashCollection BillingDocumentType = "cashCollection"
	BillingDocumentTypeProforma       BillingDocumentType = "proforma"
)

type WorkOrderStatus string

const (
	WorkOrderStatusDraft     WorkOrderStatus = "draft"
	WorkOrderStatusActive    WorkOrderStatus = "active"
	WorkOrderStatusCompleted WorkOrderStatus = "completed"
	WorkOrderStatusCancelled WorkOrderStatus = "cancelled"
)

type User struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Role     UserRole `json:"role"`
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
	DeliveryMethod    *DeliveryMethod `json:"deliveryMethod"`
	HasPackaging      bool            `json:"hasPackaging"`
	HasLabeling       bool            `json:"hasLabeling"`
	IsFragile         bool            `json:"isFragile"`
	RequiresSignature bool            `json:"requiresSignature"`
	HasInsurance      bool            `json:"hasInsurance"`
	ShippingAddress   *string         `json:"shippingAddress"`
}

type WorkOrder struct {
	ID                    string               `json:"id"`
	OrderNumber           string               `json:"orderNumber"`
	ClientName            string               `json:"clientName"`
	ContactPerson         *string              `json:"contactPerson"`
	JobDescription        string               `json:"jobDescription"`
	JobDetails            *JobDetails          `json:"jobDetails"`
	BillingDocumentType   *BillingDocumentType `json:"billingDocumentType"`
	BillingDocumentNumber *string              `json:"billingDocumentNumber"`
	Shipping              Shipping             `json:"shipping"`
	IssuedBy              string               `json:"issuedBy"`
	ExecutedBy            *string              `json:"executedBy"`
	IssueDate             string               `json:"issueDate"`
	DueDate               *string              `json:"dueDate"`
	IsCompleted           bool                 `json:"isCompleted"`
	Status                WorkOrderStatus      `json:"status"`
	Price                 *int                 `json:"price"`
	Note                  *string              `json:"note"`
	CreatedAt             string               `json:"createdAt"`
	UpdatedAt             string               `json:"updatedAt"`
	CompletionDate        *string              `json:"completionDate"`
}

type CreateWorkOrderInput struct {
	ClientName            string               `json:"clientName"`
	ContactPerson         *string              `json:"contactPerson"`
	JobDescription        string               `json:"jobDescription"`
	JobDetails            *JobDetails          `json:"jobDetails"`
	BillingDocumentType   *BillingDocumentType `json:"billingDocumentType"`
	BillingDocumentNumber *string              `json:"billingDocumentNumber"`
	Shipping              Shipping             `json:"shipping"`
	IssuedBy              string               `json:"issuedBy"`
	IssueDate             string               `json:"issueDate"`
	DueDate               *string              `json:"dueDate"`
	Price                 *int                 `json:"price"`
	Note                  *string              `json:"note"`
}

type UpdateWorkOrderInput map[string]json.RawMessage

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	User    *User  `json:"user,omitempty"`
}

type DeleteWorkOrderResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}
