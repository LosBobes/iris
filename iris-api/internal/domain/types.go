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
	WorkOrderStatusDraft               WorkOrderStatus = "draft"
	WorkOrderStatusActive              WorkOrderStatus = "active"
	WorkOrderStatusNew                 WorkOrderStatus = "new"
	WorkOrderStatusAssigned            WorkOrderStatus = "assigned"
	WorkOrderStatusInProgress          WorkOrderStatus = "inProgress"
	WorkOrderStatusWaitingForCustomer  WorkOrderStatus = "waitingForCustomer"
	WorkOrderStatusWaitingForMaterials WorkOrderStatus = "waitingForMaterials"
	WorkOrderStatusCompleted           WorkOrderStatus = "completed"
	WorkOrderStatusCancelled           WorkOrderStatus = "cancelled"
	WorkOrderStatusInvoiced            WorkOrderStatus = "invoiced"
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
}

type Location struct {
	ID         string  `json:"id"`
	CustomerID string  `json:"customerId"`
	Name       string  `json:"name"`
	Address    *string `json:"address"`
}

type Assignment struct {
	AssignedTo    *string           `json:"assignedTo"`
	Priority      WorkOrderPriority `json:"priority"`
	ScheduledDate *string           `json:"scheduledDate"`
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
	Quantity    int                 `json:"quantity"`
	Unit        InvoiceUnit         `json:"unit"`
	UnitPrice   float64             `json:"unitPrice"`
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
	ID                    string                   `json:"id"`
	OrderNumber           string                   `json:"orderNumber"`
	CustomerID            *string                  `json:"customerId"`
	LocationID            *string                  `json:"locationId"`
	ClientName            string                   `json:"clientName"`
	ContactPerson         *string                  `json:"contactPerson"`
	JobDescription        string                   `json:"jobDescription"`
	JobDetails            *JobDetails              `json:"jobDetails"`
	BillingDocumentType   *BillingDocumentType     `json:"billingDocumentType"`
	BillingDocumentNumber *string                  `json:"billingDocumentNumber"`
	Shipping              Shipping                 `json:"shipping"`
	IssuedBy              string                   `json:"issuedBy"`
	ExecutedBy            *string                  `json:"executedBy"`
	Assignment            Assignment               `json:"assignment"`
	IssueDate             string                   `json:"issueDate"`
	DueDate               *string                  `json:"dueDate"`
	IsCompleted           bool                     `json:"isCompleted"`
	Status                WorkOrderStatus          `json:"status"`
	Price                 *float64                 `json:"price"`
	Note                  *string                  `json:"note"`
	CreatedAt             string                   `json:"createdAt"`
	UpdatedAt             string                   `json:"updatedAt"`
	CompletionDate        *string                  `json:"completionDate"`
	StatusHistory         []WorkOrderStatusHistory `json:"statusHistory"`
	InternalNotes         []WorkOrderNote          `json:"internalNotes"`
	CustomerNotes         []WorkOrderNote          `json:"customerNotes"`
	Events                []WorkOrderEvent         `json:"events"`
	Attachments           []Attachment             `json:"attachments"`
	MaterialUsage         []MaterialUsage          `json:"materialUsage"`
	TimeEntries           []TimeEntry              `json:"timeEntries"`
	InvoiceDraft          InvoiceDraft             `json:"invoiceDraft"`
	Communication         CustomerCommunication    `json:"communication"`
}

type CreateWorkOrderInput struct {
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
	IssueDate             string                `json:"issueDate"`
	DueDate               *string               `json:"dueDate"`
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
