package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const invalidWorkOrderMessage = "Prosleđeni podaci nisu ispravni."

// ValidationError marks store-level request validation failures that should be
// surfaced as client errors instead of internal server errors.
type ValidationError struct {
	message string
}

func (e *ValidationError) Error() string {
	return e.message
}

func newValidationError(message string) error {
	return &ValidationError{message: message}
}

// FixtureStore is the persistence layer for this starter API.
//
// Right now it reads JSON fixtures from disk on first access and then keeps an
// in-memory mutable slice for the lifetime of the process.
type FixtureStore struct {
	basePath string

	mu           sync.Mutex
	workOrders   []domain.WorkOrder
	nextSequence int
	loaded       bool
}

func NewFixtureStore(basePath string) *FixtureStore {
	return &FixtureStore{basePath: basePath}
}

// Users reads login fixture data.
func (s *FixtureStore) Users() ([]domain.FixtureUser, error) {
	var users []domain.FixtureUser
	if err := s.readJSON("users.json", &users); err != nil {
		return nil, err
	}
	return users, nil
}

// WorkOrders returns the current in-memory work-order collection.
func (s *FixtureStore) WorkOrders() ([]domain.WorkOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}

	return cloneWorkOrders(s.workOrders), nil
}

// WorkOrderByID returns one work order or nil when the id is unknown.
func (s *FixtureStore) WorkOrderByID(id string) (*domain.WorkOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}

	for _, workOrder := range s.workOrders {
		if workOrder.ID == id {
			return cloneWorkOrder(workOrder), nil
		}
	}

	return nil, nil
}

// CreateWorkOrder appends a new work order to the in-memory slice.
func (s *FixtureStore) CreateWorkOrder(input domain.CreateWorkOrderInput) (*domain.WorkOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}

	if err := validateCreateWorkOrderInput(input); err != nil {
		return nil, err
	}

	sequence := s.nextSequence
	s.nextSequence++
	now := time.Now().UTC().Format(time.RFC3339)
	newOrder := domain.WorkOrder{
		ID:                    strconv.Itoa(sequence),
		OrderNumber:           generateOrderNumber(sequence),
		ClientName:            input.ClientName,
		ContactPerson:         input.ContactPerson,
		JobDescription:        input.JobDescription,
		JobDetails:            input.JobDetails,
		BillingDocumentType:   input.BillingDocumentType,
		BillingDocumentNumber: input.BillingDocumentNumber,
		Shipping:              input.Shipping,
		IssuedBy:              input.IssuedBy,
		ExecutedBy:            nil,
		IssueDate:             input.IssueDate,
		DueDate:               input.DueDate,
		IsCompleted:           false,
		Status:                domain.WorkOrderStatusActive,
		Price:                 input.Price,
		Note:                  input.Note,
		CreatedAt:             now,
		UpdatedAt:             now,
		CompletionDate:        nil,
	}

	s.workOrders = append(s.workOrders, newOrder)
	return cloneWorkOrder(newOrder), nil
}

// UpdateWorkOrder applies a partial update and returns nil when the id is not found.
func (s *FixtureStore) UpdateWorkOrder(
	id string,
	changes domain.UpdateWorkOrderInput,
) (*domain.WorkOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}

	for index, workOrder := range s.workOrders {
		if workOrder.ID != id {
			continue
		}

		updated, err := applyWorkOrderChanges(workOrder, changes)
		if err != nil {
			return nil, err
		}

		updated.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		s.workOrders[index] = updated
		return cloneWorkOrder(updated), nil
	}

	return nil, nil
}

// DeleteWorkOrder removes a work order by id and keeps not-found as a business response.
func (s *FixtureStore) DeleteWorkOrder(id string) (domain.DeleteWorkOrderResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return domain.DeleteWorkOrderResponse{}, err
	}

	for index, workOrder := range s.workOrders {
		if workOrder.ID != id {
			continue
		}

		s.workOrders = append(s.workOrders[:index], s.workOrders[index+1:]...)
		return domain.DeleteWorkOrderResponse{Success: true}, nil
	}

	return domain.DeleteWorkOrderResponse{
		Success: false,
		Message: "Radni nalog nije pronađen.",
	}, nil
}

// Operators derives a sorted, unique operator list from the work-order data.
func (s *FixtureStore) Operators() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(s.workOrders))
	operators := make([]string, 0, len(s.workOrders))
	for _, workOrder := range s.workOrders {
		if workOrder.IssuedBy == "" {
			continue
		}
		if _, exists := seen[workOrder.IssuedBy]; exists {
			continue
		}
		seen[workOrder.IssuedBy] = struct{}{}
		operators = append(operators, workOrder.IssuedBy)
	}

	sort.Strings(operators)
	return operators, nil
}

func (s *FixtureStore) ensureWorkOrdersLoaded() error {
	if s.loaded {
		return nil
	}

	var rawOrders []domain.WorkOrder
	if err := s.readJSON("work-orders.json", &rawOrders); err != nil {
		return err
	}

	s.workOrders = make([]domain.WorkOrder, len(rawOrders))
	for index, rawOrder := range rawOrders {
		s.workOrders[index] = normalizeWorkOrder(rawOrder)
	}
	s.nextSequence = nextSequenceStart(s.workOrders)
	s.loaded = true

	return nil
}

func normalizeWorkOrder(raw domain.WorkOrder) domain.WorkOrder {
	normalized := raw
	if normalized.Status == "" {
		normalized.Status = domain.WorkOrderStatusActive
	}
	if normalized.CreatedAt == "" {
		normalized.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if normalized.UpdatedAt == "" {
		normalized.UpdatedAt = normalized.CreatedAt
	}

	return normalized
}

func nextSequenceStart(workOrders []domain.WorkOrder) int {
	maxID := 0
	for _, workOrder := range workOrders {
		value, err := strconv.Atoi(workOrder.ID)
		if err != nil {
			continue
		}
		if value > maxID {
			maxID = value
		}
	}

	if maxID == 0 {
		return len(workOrders) + 1
	}

	return maxID + 1
}

func generateOrderNumber(sequence int) string {
	return fmt.Sprintf("RN-%d-%04d", time.Now().UTC().Year(), sequence)
}

func validateCreateWorkOrderInput(input domain.CreateWorkOrderInput) error {
	if strings.TrimSpace(input.ClientName) == "" ||
		strings.TrimSpace(input.JobDescription) == "" ||
		strings.TrimSpace(input.IssuedBy) == "" ||
		strings.TrimSpace(input.IssueDate) == "" {
		return newValidationError(invalidWorkOrderMessage)
	}

	if err := validateShipping(input.Shipping); err != nil {
		return err
	}
	if err := validateBillingDocumentType(input.BillingDocumentType); err != nil {
		return err
	}

	return nil
}

func applyWorkOrderChanges(
	current domain.WorkOrder,
	changes domain.UpdateWorkOrderInput,
) (domain.WorkOrder, error) {
	if len(changes) == 0 {
		return domain.WorkOrder{}, newValidationError(invalidWorkOrderMessage)
	}

	updated := current
	for field, raw := range changes {
		switch field {
		case "clientName":
			var value string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.ClientName = value
		case "contactPerson":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.ContactPerson = value
		case "jobDescription":
			var value string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.JobDescription = value
		case "jobDetails":
			var value *domain.JobDetails
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.JobDetails = value
		case "billingDocumentType":
			var value *domain.BillingDocumentType
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			if err := validateBillingDocumentType(value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.BillingDocumentType = value
		case "billingDocumentNumber":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.BillingDocumentNumber = value
		case "shipping":
			var value domain.Shipping
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			if err := validateShipping(value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Shipping = value
		case "issuedBy":
			var value string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.IssuedBy = value
		case "executedBy":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.ExecutedBy = value
		case "issueDate":
			var value string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.IssueDate = value
		case "dueDate":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.DueDate = value
		case "isCompleted":
			var value bool
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.IsCompleted = value
		case "status":
			var value domain.WorkOrderStatus
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			if !isValidStatus(value) {
				return domain.WorkOrder{}, newValidationError(invalidWorkOrderMessage)
			}
			updated.Status = value
		case "price":
			var value *int
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Price = value
		case "note":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Note = value
		case "completionDate":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.CompletionDate = value
		default:
			return domain.WorkOrder{}, newValidationError(invalidWorkOrderMessage)
		}
	}

	if err := validateCreateWorkOrderInput(domain.CreateWorkOrderInput{
		ClientName:            updated.ClientName,
		ContactPerson:         updated.ContactPerson,
		JobDescription:        updated.JobDescription,
		JobDetails:            updated.JobDetails,
		BillingDocumentType:   updated.BillingDocumentType,
		BillingDocumentNumber: updated.BillingDocumentNumber,
		Shipping:              updated.Shipping,
		IssuedBy:              updated.IssuedBy,
		IssueDate:             updated.IssueDate,
		DueDate:               updated.DueDate,
		Price:                 updated.Price,
		Note:                  updated.Note,
	}); err != nil {
		return domain.WorkOrder{}, err
	}

	return updated, nil
}

func decodeField(raw json.RawMessage, target any) error {
	if err := json.Unmarshal(raw, target); err != nil {
		return newValidationError(invalidWorkOrderMessage)
	}

	return nil
}

func validateShipping(shipping domain.Shipping) error {
	if shipping.DeliveryMethod != nil && !isValidDeliveryMethod(*shipping.DeliveryMethod) {
		return newValidationError(invalidWorkOrderMessage)
	}

	return nil
}

func validateBillingDocumentType(value *domain.BillingDocumentType) error {
	if value != nil && !isValidBillingDocumentType(*value) {
		return newValidationError(invalidWorkOrderMessage)
	}

	return nil
}

func isValidDeliveryMethod(value domain.DeliveryMethod) bool {
	switch value {
	case domain.DeliveryMethodPickup,
		domain.DeliveryMethodPostExpress,
		domain.DeliveryMethodCityExpress,
		domain.DeliveryMethodFieldVisit:
		return true
	default:
		return false
	}
}

func isValidBillingDocumentType(value domain.BillingDocumentType) bool {
	switch value {
	case domain.BillingDocumentTypeInvoice,
		domain.BillingDocumentTypeCashCollection,
		domain.BillingDocumentTypeProforma:
		return true
	default:
		return false
	}
}

func isValidStatus(value domain.WorkOrderStatus) bool {
	switch value {
	case domain.WorkOrderStatusDraft,
		domain.WorkOrderStatusActive,
		domain.WorkOrderStatusCompleted,
		domain.WorkOrderStatusCancelled:
		return true
	default:
		return false
	}
}

// cloneWorkOrders deep-copies the slice so callers can mutate freely without
// affecting the in-memory store. Pointer fields (JobDetails, *string, *int,
// *enum) all need fresh allocations.
func cloneWorkOrders(workOrders []domain.WorkOrder) []domain.WorkOrder {
	cloned := make([]domain.WorkOrder, len(workOrders))
	for i, workOrder := range workOrders {
		cloned[i] = deepCopyWorkOrder(workOrder)
	}
	return cloned
}

func cloneWorkOrder(workOrder domain.WorkOrder) *domain.WorkOrder {
	cloned := deepCopyWorkOrder(workOrder)
	return &cloned
}

func deepCopyWorkOrder(workOrder domain.WorkOrder) domain.WorkOrder {
	cloned := workOrder
	cloned.ContactPerson = clonePtrString(workOrder.ContactPerson)
	cloned.JobDetails = cloneJobDetails(workOrder.JobDetails)
	cloned.BillingDocumentType = clonePtrBillingDocumentType(workOrder.BillingDocumentType)
	cloned.BillingDocumentNumber = clonePtrString(workOrder.BillingDocumentNumber)
	cloned.Shipping = cloneShipping(workOrder.Shipping)
	cloned.ExecutedBy = clonePtrString(workOrder.ExecutedBy)
	cloned.DueDate = clonePtrString(workOrder.DueDate)
	cloned.Price = clonePtrInt(workOrder.Price)
	cloned.Note = clonePtrString(workOrder.Note)
	cloned.CompletionDate = clonePtrString(workOrder.CompletionDate)
	return cloned
}

func cloneJobDetails(value *domain.JobDetails) *domain.JobDetails {
	if value == nil {
		return nil
	}
	cloned := *value
	cloned.ProductCode = clonePtrString(value.ProductCode)
	cloned.PaperWeightGsm = clonePtrInt(value.PaperWeightGsm)
	cloned.Dimensions = clonePtrString(value.Dimensions)
	cloned.Quantity = clonePtrInt(value.Quantity)
	cloned.FinishingNote = clonePtrString(value.FinishingNote)
	return &cloned
}

func cloneShipping(value domain.Shipping) domain.Shipping {
	cloned := value
	cloned.DeliveryMethod = clonePtrDeliveryMethod(value.DeliveryMethod)
	cloned.ShippingAddress = clonePtrString(value.ShippingAddress)
	return cloned
}

func clonePtrString(value *string) *string {
	if value == nil {
		return nil
	}
	v := *value
	return &v
}

func clonePtrInt(value *int) *int {
	if value == nil {
		return nil
	}
	v := *value
	return &v
}

func clonePtrDeliveryMethod(value *domain.DeliveryMethod) *domain.DeliveryMethod {
	if value == nil {
		return nil
	}
	v := *value
	return &v
}

func clonePtrBillingDocumentType(value *domain.BillingDocumentType) *domain.BillingDocumentType {
	if value == nil {
		return nil
	}
	v := *value
	return &v
}

// readJSON is the low-level helper that turns one fixture file into one Go
// value. The public methods above decide which concrete type is expected.
func (s *FixtureStore) readJSON(fileName string, target any) error {
	path := filepath.Join(s.basePath, fileName)
	contents, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read fixture %s: %w", fileName, err)
	}

	if err := json.Unmarshal(contents, target); err != nil {
		return fmt.Errorf("decode fixture %s: %w", fileName, err)
	}

	return nil
}
