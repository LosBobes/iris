package store

import (
	"context"
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
const invalidStatusTransitionMessage = "Promena statusa nije dozvoljena."

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
	sessions     map[string]fixtureSession
}

type fixtureSession struct {
	userID    string
	expiresAt time.Time
}

func NewFixtureStore(basePath string) *FixtureStore {
	return &FixtureStore{
		basePath: basePath,
		sessions: make(map[string]fixtureSession),
	}
}

func (s *FixtureStore) AuthenticateUser(
	ctx context.Context,
	username string,
	password string,
) (*domain.User, error) {
	users, err := s.Users(ctx)
	if err != nil {
		return nil, err
	}

	for _, user := range users {
		if user.Username == username && user.Password == password {
			return &domain.User{
				ID:       user.ID,
				Username: user.Username,
				Role:     user.Role,
			}, nil
		}
	}

	return nil, nil
}

func (s *FixtureStore) CreateSession(
	_ context.Context,
	userID string,
	expiresAt time.Time,
) (string, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[token] = fixtureSession{userID: userID, expiresAt: expiresAt}
	return token, nil
}

func (s *FixtureStore) UserBySessionToken(ctx context.Context, token string) (*domain.User, error) {
	s.mu.Lock()
	session, ok := s.sessions[token]
	if ok && time.Now().UTC().After(session.expiresAt) {
		delete(s.sessions, token)
		ok = false
	}
	s.mu.Unlock()
	if !ok {
		return nil, nil
	}

	users, err := s.Users(ctx)
	if err != nil {
		return nil, err
	}
	for _, user := range users {
		if user.ID == session.userID {
			return &domain.User{ID: user.ID, Username: user.Username, Role: user.Role}, nil
		}
	}
	return nil, nil
}

func (s *FixtureStore) DeleteSession(_ context.Context, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
	return nil
}

// Users reads login fixture data.
func (s *FixtureStore) Users(_ context.Context) ([]domain.FixtureUser, error) {
	var users []domain.FixtureUser
	if err := s.readJSON("users.json", &users); err != nil {
		return nil, err
	}
	return users, nil
}

// Customers reads normalized customer fixture data.
func (s *FixtureStore) Customers(_ context.Context) ([]domain.Customer, error) {
	var customers []domain.Customer
	if err := s.readJSON("customers.json", &customers); err != nil {
		return nil, err
	}
	return customers, nil
}

// Locations reads normalized customer location fixture data.
func (s *FixtureStore) Locations(_ context.Context) ([]domain.Location, error) {
	var locations []domain.Location
	if err := s.readJSON("locations.json", &locations); err != nil {
		return nil, err
	}
	return locations, nil
}

func (s *FixtureStore) UpsertCustomer(
	_ context.Context,
	customer domain.Customer,
) (*domain.Customer, error) {
	if strings.TrimSpace(customer.ID) == "" || strings.TrimSpace(customer.Name) == "" {
		return nil, newValidationError(invalidWorkOrderMessage)
	}
	return &customer, nil
}

func (s *FixtureStore) UpsertLocation(
	_ context.Context,
	location domain.Location,
) (*domain.Location, error) {
	if strings.TrimSpace(location.ID) == "" ||
		strings.TrimSpace(location.CustomerID) == "" ||
		strings.TrimSpace(location.Name) == "" {
		return nil, newValidationError(invalidWorkOrderMessage)
	}
	return &location, nil
}

func (s *FixtureStore) DeleteCustomer(_ context.Context, _ string) error {
	return nil
}

func (s *FixtureStore) DeleteLocation(_ context.Context, _ string) error {
	return nil
}

// WorkOrders returns the current in-memory work-order collection.
func (s *FixtureStore) WorkOrders(_ context.Context, query WorkOrderListQuery) (WorkOrderListResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return WorkOrderListResult{}, err
	}

	filtered := filterWorkOrders(s.workOrders, query)
	total := len(filtered)
	filtered = paginateWorkOrders(filtered, query)

	return WorkOrderListResult{Items: cloneWorkOrders(filtered), Total: total}, nil
}

// WorkOrderByID returns one work order or nil when the id is unknown.
func (s *FixtureStore) WorkOrderByID(_ context.Context, id string) (*domain.WorkOrder, error) {
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
func (s *FixtureStore) CreateWorkOrder(
	_ context.Context,
	input domain.CreateWorkOrderInput,
) (*domain.WorkOrder, error) {
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
		CustomerID:            input.CustomerID,
		LocationID:            input.LocationID,
		ClientName:            input.ClientName,
		ContactPerson:         input.ContactPerson,
		JobDescription:        input.JobDescription,
		JobDetails:            input.JobDetails,
		BillingDocumentType:   input.BillingDocumentType,
		BillingDocumentNumber: input.BillingDocumentNumber,
		Shipping:              input.Shipping,
		IssuedBy:              input.IssuedBy,
		ExecutedBy:            nil,
		Assignment:            normalizeAssignment(input.Assignment),
		IssueDate:             input.IssueDate,
		DueDate:               input.DueDate,
		IsCompleted:           false,
		Status:                domain.WorkOrderStatusNew,
		Price:                 input.Price,
		Note:                  input.Note,
		CreatedAt:             now,
		UpdatedAt:             now,
		CompletionDate:        nil,
		StatusHistory: []domain.WorkOrderStatusHistory{
			{Status: domain.WorkOrderStatusNew, ChangedAt: now, ChangedBy: input.IssuedBy},
		},
		InternalNotes: input.InternalNotes,
		CustomerNotes: input.CustomerNotes,
		Events: []domain.WorkOrderEvent{
			{ID: "event-created", Kind: "created", Label: "Nalog kreiran", Actor: input.IssuedBy, CreatedAt: now},
		},
		Attachments:   input.Attachments,
		MaterialUsage: input.MaterialUsage,
		TimeEntries:   input.TimeEntries,
		InvoiceDraft:  normalizeInvoiceDraft(input.InvoiceDraft, input.JobDescription, input.Price),
		Communication: normalizeCommunication(input.Communication, sequence, nil),
	}

	s.workOrders = append(s.workOrders, newOrder)
	return cloneWorkOrder(newOrder), nil
}

// UpdateWorkOrder applies a partial update and returns nil when the id is not found.
func (s *FixtureStore) UpdateWorkOrder(
	_ context.Context,
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
func (s *FixtureStore) DeleteWorkOrder(_ context.Context, id string) (domain.DeleteWorkOrderResponse, error) {
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
func (s *FixtureStore) Operators(_ context.Context) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(s.workOrders))
	operators := make([]string, 0, len(s.workOrders))
	for _, workOrder := range s.workOrders {
		candidates := []string{workOrder.IssuedBy}
		if workOrder.Assignment.AssignedTo != nil {
			candidates = append(candidates, *workOrder.Assignment.AssignedTo)
		}
		if workOrder.ExecutedBy != nil {
			candidates = append(candidates, *workOrder.ExecutedBy)
		}
		for _, candidate := range candidates {
			if candidate == "" {
				continue
			}
			if _, exists := seen[candidate]; exists {
				continue
			}
			seen[candidate] = struct{}{}
			operators = append(operators, candidate)
		}
	}

	sort.Strings(operators)
	return operators, nil
}

func filterWorkOrders(workOrders []domain.WorkOrder, query WorkOrderListQuery) []domain.WorkOrder {
	filtered := make([]domain.WorkOrder, 0, len(workOrders))
	search := strings.ToLower(strings.TrimSpace(query.Search))
	for _, workOrder := range workOrders {
		if search != "" {
			searchable := strings.ToLower(strings.Join([]string{
				workOrder.OrderNumber,
				workOrder.ClientName,
				workOrder.JobDescription,
			}, " "))
			if !strings.Contains(searchable, search) {
				continue
			}
		}
		if query.Status != "" && workOrder.Status != query.Status {
			continue
		}
		if query.AssignedTo != "" {
			assignedTo := ""
			if workOrder.Assignment.AssignedTo != nil {
				assignedTo = *workOrder.Assignment.AssignedTo
			}
			if assignedTo != query.AssignedTo {
				continue
			}
		}
		if query.DateFrom != "" && workOrder.IssueDate < query.DateFrom {
			continue
		}
		if query.DateTo != "" && workOrder.IssueDate > query.DateTo {
			continue
		}
		filtered = append(filtered, workOrder)
	}

	sortWorkOrders(filtered, query.Sort)
	return filtered
}

func paginateWorkOrders(workOrders []domain.WorkOrder, query WorkOrderListQuery) []domain.WorkOrder {
	if query.Offset >= len(workOrders) {
		return []domain.WorkOrder{}
	}
	start := query.Offset
	if start < 0 {
		start = 0
	}
	end := len(workOrders)
	if query.Limit > 0 && start+query.Limit < end {
		end = start + query.Limit
	}
	return workOrders[start:end]
}

func sortWorkOrders(workOrders []domain.WorkOrder, sortKey string) {
	desc := strings.HasPrefix(sortKey, "-")
	field := strings.TrimPrefix(sortKey, "-")
	if field == "" {
		field = "issueDate"
		desc = true
	}

	sort.SliceStable(workOrders, func(i int, j int) bool {
		a := workOrderSortValue(workOrders[i], field)
		b := workOrderSortValue(workOrders[j], field)
		if desc {
			return a > b
		}
		return a < b
	})
}

func workOrderSortValue(workOrder domain.WorkOrder, field string) string {
	switch field {
	case "orderNumber":
		return workOrder.OrderNumber
	case "clientName":
		return workOrder.ClientName
	case "status":
		return string(workOrder.Status)
	case "assignedTo":
		if workOrder.Assignment.AssignedTo == nil {
			return ""
		}
		return *workOrder.Assignment.AssignedTo
	case "dueDate":
		if workOrder.DueDate == nil {
			return ""
		}
		return *workOrder.DueDate
	default:
		return workOrder.IssueDate
	}
}

func (s *FixtureStore) ensureWorkOrdersLoaded() error {
	if s.loaded {
		return nil
	}

	var rawOrders []domain.WorkOrder
	if err := s.readJSON("work-orders.json", &rawOrders); err != nil {
		return err
	}
	customers, _ := s.Customers(context.Background())
	locations, _ := s.Locations(context.Background())

	s.workOrders = make([]domain.WorkOrder, len(rawOrders))
	for index, rawOrder := range rawOrders {
		s.workOrders[index] = normalizeWorkOrder(rawOrder, customers, locations)
	}
	s.nextSequence = nextSequenceStart(s.workOrders)
	s.loaded = true

	return nil
}

func normalizeWorkOrder(
	raw domain.WorkOrder,
	customers []domain.Customer,
	locations []domain.Location,
) domain.WorkOrder {
	normalized := raw
	normalized.Status = normalizeStatus(normalized.Status)
	if normalized.CreatedAt == "" {
		normalized.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if normalized.UpdatedAt == "" {
		normalized.UpdatedAt = normalized.CreatedAt
	}
	normalized.IsCompleted = normalized.Status == domain.WorkOrderStatusCompleted ||
		normalized.Status == domain.WorkOrderStatusInvoiced
	normalized.Assignment = normalizeAssignmentWithFallback(normalized.Assignment, normalized)
	normalized.CustomerID = normalizeCustomerID(normalized.CustomerID, normalized.ClientName, customers)
	normalized.LocationID = normalizeLocationID(normalized.LocationID, normalized.CustomerID, locations)
	normalized.StatusHistory = normalizeStatusHistory(normalized.StatusHistory, normalized)
	normalized.Events = normalizeEvents(normalized.Events, normalized)
	normalized.InternalNotes = normalizeNotes(normalized.InternalNotes, domain.WorkOrderNoteInternal, normalized.IssuedBy, normalized.CreatedAt)
	normalized.CustomerNotes = normalizeNotes(normalized.CustomerNotes, domain.WorkOrderNoteCustomer, normalized.IssuedBy, normalized.CreatedAt)
	normalized.Attachments = normalizeAttachments(normalized.Attachments, normalized.CreatedAt)
	normalized.MaterialUsage = normalizeMaterialUsage(normalized.MaterialUsage)
	normalized.TimeEntries = normalizeTimeEntries(normalized.TimeEntries, normalized.IssuedBy, normalized.CreatedAt)
	normalized.InvoiceDraft = normalizeInvoiceDraft(normalized.InvoiceDraft, normalized.JobDescription, normalized.Price)
	normalized.Communication = normalizeCommunication(normalized.Communication, idSequence(normalized.ID), customerEmail(normalized.CustomerID, customers))

	return normalized
}

func normalizeStatus(status domain.WorkOrderStatus) domain.WorkOrderStatus {
	switch status {
	case "", domain.WorkOrderStatusDraft:
		return domain.WorkOrderStatusNew
	case domain.WorkOrderStatusActive:
		return domain.WorkOrderStatusInProgress
	default:
		return status
	}
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

func idSequence(id string) int {
	value, err := strconv.Atoi(id)
	if err != nil || value <= 0 {
		return 0
	}
	return value
}

func normalizeCustomerID(value *string, clientName string, customers []domain.Customer) *string {
	if value != nil {
		return clonePtrString(value)
	}
	for _, customer := range customers {
		if strings.EqualFold(customer.Name, clientName) {
			id := customer.ID
			return &id
		}
	}
	return nil
}

func normalizeLocationID(value *string, customerID *string, locations []domain.Location) *string {
	if value != nil {
		return clonePtrString(value)
	}
	if customerID == nil {
		return nil
	}
	for _, location := range locations {
		if location.CustomerID == *customerID {
			id := location.ID
			return &id
		}
	}
	return nil
}

func customerEmail(customerID *string, customers []domain.Customer) *string {
	if customerID == nil {
		return nil
	}
	for _, customer := range customers {
		if customer.ID == *customerID {
			return clonePtrString(customer.Email)
		}
	}
	return nil
}

func normalizeAssignment(value domain.Assignment) domain.Assignment {
	normalized := value
	if normalized.Priority == "" {
		normalized.Priority = domain.WorkOrderPriorityNormal
	}
	return normalized
}

func normalizeAssignmentWithFallback(value domain.Assignment, workOrder domain.WorkOrder) domain.Assignment {
	normalized := normalizeAssignment(value)
	if normalized.AssignedTo == nil {
		if workOrder.ExecutedBy != nil {
			normalized.AssignedTo = clonePtrString(workOrder.ExecutedBy)
		} else if strings.TrimSpace(workOrder.IssuedBy) != "" {
			assignedTo := workOrder.IssuedBy
			normalized.AssignedTo = &assignedTo
		}
	}
	if normalized.ScheduledDate == nil {
		normalized.ScheduledDate = clonePtrString(workOrder.DueDate)
	}
	return normalized
}

func normalizeStatusHistory(
	history []domain.WorkOrderStatusHistory,
	workOrder domain.WorkOrder,
) []domain.WorkOrderStatusHistory {
	if len(history) > 0 {
		return history
	}
	return []domain.WorkOrderStatusHistory{
		{Status: workOrder.Status, ChangedAt: workOrder.CreatedAt, ChangedBy: workOrder.IssuedBy},
	}
}

func normalizeEvents(events []domain.WorkOrderEvent, workOrder domain.WorkOrder) []domain.WorkOrderEvent {
	if len(events) > 0 {
		return events
	}
	normalized := []domain.WorkOrderEvent{
		{ID: "event-created", Kind: "created", Label: "Nalog kreiran", Actor: workOrder.IssuedBy, CreatedAt: workOrder.CreatedAt},
	}
	if workOrder.Status == domain.WorkOrderStatusCompleted || workOrder.Status == domain.WorkOrderStatusInvoiced {
		actor := workOrder.IssuedBy
		if workOrder.ExecutedBy != nil {
			actor = *workOrder.ExecutedBy
		}
		createdAt := workOrder.UpdatedAt
		if workOrder.CompletionDate != nil {
			createdAt = *workOrder.CompletionDate
		}
		normalized = append(normalized, domain.WorkOrderEvent{
			ID: "event-completed", Kind: "completed", Label: "Nalog završen", Actor: actor, CreatedAt: createdAt,
		})
	}
	return normalized
}

func normalizeNotes(
	notes []domain.WorkOrderNote,
	visibility domain.WorkOrderNoteVisibility,
	author string,
	createdAt string,
) []domain.WorkOrderNote {
	if notes == nil {
		return []domain.WorkOrderNote{}
	}
	for index := range notes {
		if notes[index].ID == "" {
			notes[index].ID = fmt.Sprintf("note-%d", index+1)
		}
		if notes[index].Visibility == "" {
			notes[index].Visibility = visibility
		}
		if notes[index].Author == "" {
			notes[index].Author = author
		}
		if notes[index].CreatedAt == "" {
			notes[index].CreatedAt = createdAt
		}
	}
	return notes
}

func normalizeAttachments(attachments []domain.Attachment, createdAt string) []domain.Attachment {
	if attachments == nil {
		return []domain.Attachment{}
	}
	for index := range attachments {
		if attachments[index].ID == "" {
			attachments[index].ID = fmt.Sprintf("attachment-%d", index+1)
		}
		if attachments[index].UploadedAt == "" {
			attachments[index].UploadedAt = createdAt
		}
	}
	return attachments
}

func normalizeMaterialUsage(materials []domain.MaterialUsage) []domain.MaterialUsage {
	if materials == nil {
		return []domain.MaterialUsage{}
	}
	for index := range materials {
		if materials[index].ID == "" {
			materials[index].ID = fmt.Sprintf("material-%d", index+1)
		}
	}
	return materials
}

func normalizeTimeEntries(entries []domain.TimeEntry, operator string, createdAt string) []domain.TimeEntry {
	if entries == nil {
		return []domain.TimeEntry{}
	}
	for index := range entries {
		if entries[index].ID == "" {
			entries[index].ID = fmt.Sprintf("time-%d", index+1)
		}
		if entries[index].Operator == "" {
			entries[index].Operator = operator
		}
		if entries[index].LoggedAt == "" {
			entries[index].LoggedAt = createdAt
		}
	}
	return entries
}

func normalizeInvoiceDraft(
	draft domain.InvoiceDraft,
	jobDescription string,
	price *float64,
) domain.InvoiceDraft {
	normalized := draft
	if normalized.Status == "" {
		if price == nil {
			normalized.Status = domain.InvoiceDraftStatusNone
		} else {
			normalized.Status = domain.InvoiceDraftStatusDraft
		}
	}
	if normalized.LineItems == nil {
		normalized.LineItems = []domain.InvoiceLineItem{}
	}
	if price != nil && len(normalized.LineItems) == 0 {
		normalized.LineItems = []domain.InvoiceLineItem{
			{ID: "line-1", Description: jobDescription, Quantity: 1, UnitPrice: *price},
		}
	}
	return normalized
}

func normalizeCommunication(
	communication domain.CustomerCommunication,
	sequence int,
	fallbackEmail *string,
) domain.CustomerCommunication {
	normalized := communication
	if normalized.PublicToken == "" {
		if sequence > 0 {
			normalized.PublicToken = fmt.Sprintf("wo-%04d", sequence)
		} else {
			normalized.PublicToken = fmt.Sprintf("wo-%d", time.Now().UTC().UnixNano())
		}
	}
	if normalized.NotificationEmail == nil {
		normalized.NotificationEmail = clonePtrString(fallbackEmail)
	}
	return normalized
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
	if err := validateAssignment(input.Assignment); err != nil {
		return err
	}
	if err := validateInvoiceDraft(input.InvoiceDraft); err != nil {
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
		case "customerId":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.CustomerID = value
		case "locationId":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.LocationID = value
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
		case "assignment":
			var value domain.Assignment
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			if err := validateAssignment(value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Assignment = normalizeAssignment(value)
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
			value = normalizeStatus(value)
			if !isValidStatus(value) {
				return domain.WorkOrder{}, newValidationError(invalidWorkOrderMessage)
			}
			if value != updated.Status && !canTransition(updated.Status, value) {
				return domain.WorkOrder{}, newValidationError(invalidStatusTransitionMessage)
			}
			applyStatus(&updated, value)
		case "price":
			var value *float64
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
		case "statusHistory":
			var value []domain.WorkOrderStatusHistory
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.StatusHistory = normalizeStatusHistory(value, updated)
		case "internalNotes":
			var value []domain.WorkOrderNote
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.InternalNotes = normalizeNotes(value, domain.WorkOrderNoteInternal, updated.IssuedBy, updated.UpdatedAt)
		case "customerNotes":
			var value []domain.WorkOrderNote
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.CustomerNotes = normalizeNotes(value, domain.WorkOrderNoteCustomer, updated.IssuedBy, updated.UpdatedAt)
		case "events":
			var value []domain.WorkOrderEvent
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Events = normalizeEvents(value, updated)
		case "attachments":
			var value []domain.Attachment
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Attachments = normalizeAttachments(value, updated.CreatedAt)
		case "materialUsage":
			var value []domain.MaterialUsage
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.MaterialUsage = normalizeMaterialUsage(value)
		case "timeEntries":
			var value []domain.TimeEntry
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.TimeEntries = normalizeTimeEntries(value, updated.IssuedBy, updated.CreatedAt)
		case "invoiceDraft":
			var value domain.InvoiceDraft
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			if err := validateInvoiceDraft(value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.InvoiceDraft = normalizeInvoiceDraft(value, updated.JobDescription, updated.Price)
		case "communication":
			var value domain.CustomerCommunication
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Communication = normalizeCommunication(value, idSequence(updated.ID), nil)
		default:
			return domain.WorkOrder{}, newValidationError(invalidWorkOrderMessage)
		}
	}

	if err := validateCreateWorkOrderInput(domain.CreateWorkOrderInput{
		CustomerID:            updated.CustomerID,
		LocationID:            updated.LocationID,
		ClientName:            updated.ClientName,
		ContactPerson:         updated.ContactPerson,
		JobDescription:        updated.JobDescription,
		JobDetails:            updated.JobDetails,
		BillingDocumentType:   updated.BillingDocumentType,
		BillingDocumentNumber: updated.BillingDocumentNumber,
		Shipping:              updated.Shipping,
		Assignment:            updated.Assignment,
		IssuedBy:              updated.IssuedBy,
		IssueDate:             updated.IssueDate,
		DueDate:               updated.DueDate,
		Price:                 updated.Price,
		Note:                  updated.Note,
		InternalNotes:         updated.InternalNotes,
		CustomerNotes:         updated.CustomerNotes,
		Attachments:           updated.Attachments,
		MaterialUsage:         updated.MaterialUsage,
		TimeEntries:           updated.TimeEntries,
		InvoiceDraft:          updated.InvoiceDraft,
		Communication:         updated.Communication,
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

func validateAssignment(value domain.Assignment) error {
	if value.Priority != "" && !isValidPriority(value.Priority) {
		return newValidationError(invalidWorkOrderMessage)
	}
	return nil
}

func validateInvoiceDraft(value domain.InvoiceDraft) error {
	if value.Status != "" && !isValidInvoiceDraftStatus(value.Status) {
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
	case domain.WorkOrderStatusNew,
		domain.WorkOrderStatusAssigned,
		domain.WorkOrderStatusInProgress,
		domain.WorkOrderStatusWaitingForCustomer,
		domain.WorkOrderStatusWaitingForMaterials,
		domain.WorkOrderStatusCompleted,
		domain.WorkOrderStatusCancelled,
		domain.WorkOrderStatusInvoiced:
		return true
	default:
		return false
	}
}

func isValidPriority(value domain.WorkOrderPriority) bool {
	switch value {
	case domain.WorkOrderPriorityLow,
		domain.WorkOrderPriorityNormal,
		domain.WorkOrderPriorityHigh,
		domain.WorkOrderPriorityUrgent:
		return true
	default:
		return false
	}
}

func isValidInvoiceDraftStatus(value domain.InvoiceDraftStatus) bool {
	switch value {
	case domain.InvoiceDraftStatusNone,
		domain.InvoiceDraftStatusDraft,
		domain.InvoiceDraftStatusIssued,
		domain.InvoiceDraftStatusPaid:
		return true
	default:
		return false
	}
}

func canTransition(from domain.WorkOrderStatus, to domain.WorkOrderStatus) bool {
	if from == to {
		return true
	}
	allowed := map[domain.WorkOrderStatus][]domain.WorkOrderStatus{
		domain.WorkOrderStatusNew: {
			domain.WorkOrderStatusAssigned,
			domain.WorkOrderStatusCancelled,
		},
		domain.WorkOrderStatusAssigned: {
			domain.WorkOrderStatusInProgress,
			domain.WorkOrderStatusWaitingForMaterials,
			domain.WorkOrderStatusCancelled,
		},
		domain.WorkOrderStatusInProgress: {
			domain.WorkOrderStatusWaitingForCustomer,
			domain.WorkOrderStatusWaitingForMaterials,
			domain.WorkOrderStatusCompleted,
			domain.WorkOrderStatusCancelled,
		},
		domain.WorkOrderStatusWaitingForCustomer: {
			domain.WorkOrderStatusInProgress,
			domain.WorkOrderStatusCancelled,
		},
		domain.WorkOrderStatusWaitingForMaterials: {
			domain.WorkOrderStatusInProgress,
			domain.WorkOrderStatusCancelled,
		},
		domain.WorkOrderStatusCompleted: {
			domain.WorkOrderStatusInvoiced,
		},
	}
	for _, allowedStatus := range allowed[from] {
		if allowedStatus == to {
			return true
		}
	}
	return false
}

func applyStatus(workOrder *domain.WorkOrder, status domain.WorkOrderStatus) {
	workOrder.Status = status
	now := time.Now().UTC()
	today := now.Format("2006-01-02")
	timestamp := now.Format(time.RFC3339)
	workOrder.IsCompleted = status == domain.WorkOrderStatusCompleted ||
		status == domain.WorkOrderStatusInvoiced
	if workOrder.IsCompleted && workOrder.CompletionDate == nil {
		workOrder.CompletionDate = &today
	}
	if !workOrder.IsCompleted {
		workOrder.CompletionDate = nil
	}
	workOrder.StatusHistory = append(workOrder.StatusHistory, domain.WorkOrderStatusHistory{
		Status:    status,
		ChangedAt: timestamp,
		ChangedBy: workOrder.IssuedBy,
	})
	workOrder.Events = append(workOrder.Events, domain.WorkOrderEvent{
		ID:        fmt.Sprintf("event-%d", len(workOrder.Events)+1),
		Kind:      "status",
		Label:     fmt.Sprintf("Status promenjen na %s", status),
		Actor:     workOrder.IssuedBy,
		CreatedAt: timestamp,
	})
	if status == domain.WorkOrderStatusInvoiced &&
		(workOrder.InvoiceDraft.Status == domain.InvoiceDraftStatusNone ||
			workOrder.InvoiceDraft.Status == domain.InvoiceDraftStatusDraft) {
		workOrder.InvoiceDraft.Status = domain.InvoiceDraftStatusIssued
	}
}

// cloneWorkOrders deep-copies the slice so callers can mutate freely without
// affecting the in-memory store. Pointer fields (JobDetails, *string, numbers,
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
	encoded, err := json.Marshal(workOrder)
	if err == nil {
		var cloned domain.WorkOrder
		if err := json.Unmarshal(encoded, &cloned); err == nil {
			return cloned
		}
	}
	cloned := workOrder
	cloned.ContactPerson = clonePtrString(workOrder.ContactPerson)
	cloned.JobDetails = cloneJobDetails(workOrder.JobDetails)
	cloned.BillingDocumentType = clonePtrBillingDocumentType(workOrder.BillingDocumentType)
	cloned.BillingDocumentNumber = clonePtrString(workOrder.BillingDocumentNumber)
	cloned.Shipping = cloneShipping(workOrder.Shipping)
	cloned.ExecutedBy = clonePtrString(workOrder.ExecutedBy)
	cloned.DueDate = clonePtrString(workOrder.DueDate)
	cloned.Price = clonePtrFloat64(workOrder.Price)
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

func clonePtrFloat64(value *float64) *float64 {
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
