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
	CreatedAt     string          `json:"createdAt,omitempty"`
	UpdatedAt     string          `json:"updatedAt,omitempty"`
}

// CatalogItemInput is the payload an admin submits when creating or editing a
// catalog item.
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
}

// DefaultFirmName is the shop's display name shown in the app branding until an
// administrator changes it via the organization settings.
const DefaultFirmName = "Grafika Čobanović"

// OrganizationSettings holds shop-wide branding/config an admin can edit. For
// now this is just the firm name shown in the app header and settings.
type OrganizationSettings struct {
	FirmName string `json:"firmName"`
}

type User struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Role     UserRole `json:"role"`
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
	// UnitCost is the per-unit cost (catalog PurchasePrice at order time). It is
	// derived server-side from the linked catalog item, never sent by clients,
	// and stripped from responses to non-admin users. Margin = UnitPrice-UnitCost.
	UnitCost float64 `json:"unitCost"`
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
	DueDate               *string              `json:"dueDate"`
	IsCompleted           bool                 `json:"isCompleted"`
	Status                WorkOrderStatus      `json:"status"`
	Price                 *float64             `json:"price"`
	// Profit is the cached margin (sum of (unitPrice-unitCost)*qty over line
	// items), recomputed server-side on every save. Admin-only: stripped from
	// responses to non-admin users alongside per-line UnitCost.
	Profit         *float64                 `json:"profit,omitempty"`
	Note           *string                  `json:"note"`
	CreatedAt      string                   `json:"createdAt"`
	UpdatedAt      string                   `json:"updatedAt"`
	CompletionDate *string                  `json:"completionDate"`
	StatusHistory  []WorkOrderStatusHistory `json:"statusHistory"`
	InternalNotes  []WorkOrderNote          `json:"internalNotes"`
	CustomerNotes  []WorkOrderNote          `json:"customerNotes"`
	Events         []WorkOrderEvent         `json:"events"`
	Attachments    []Attachment             `json:"attachments"`
	MaterialUsage  []MaterialUsage          `json:"materialUsage"`
	TimeEntries    []TimeEntry              `json:"timeEntries"`
	InvoiceDraft   InvoiceDraft             `json:"invoiceDraft"`
	Communication  CustomerCommunication    `json:"communication"`
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
