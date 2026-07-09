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

	mu               sync.Mutex
	customers        []domain.Customer
	locations        []domain.Location
	workOrders       []domain.WorkOrder
	enumValues       []domain.EnumValue
	catalogItems     []domain.CatalogItem
	nextEnumSequence int
	nextSequence     int
	reservations     []fixtureReservation
	editLocks        map[string]fixtureEditLock
	loaded           bool
	referencesLoaded bool
	usersLoaded      bool
	fixtureUsers     []domain.FixtureUser
	firmName            string
	pdfSections         *domain.PDFSections
	billingDefaults     *domain.BillingDefaults
	priorityDefaults    *domain.PriorityDefaults
	showShippingOptions *bool
	sessions            map[string]fixtureSession
}

type fixtureSession struct {
	userID    string
	expiresAt time.Time
}

// fixtureReservation mirrors the SQLite reservation ledger in memory so the
// fixture store (tests, seed-demo, web fixtures mode) hands out the same
// "reserve on open" order numbers.
type fixtureReservation struct {
	orderNumber string
	year        int
	sequence    int
	expiresAt   time.Time
}

type fixtureEditLock struct {
	lockedBy  string
	lockedAt  time.Time
	expiresAt time.Time
}

func NewFixtureStore(basePath string) *FixtureStore {
	return &FixtureStore{
		basePath: basePath,
		sessions: make(map[string]fixtureSession),
	}
}

// TenantBySlug resolves the single fixture tenant. Fixtures model one shop, so
// any slug matching the demo tenant resolves; everything else is unknown.
func (s *FixtureStore) TenantBySlug(_ context.Context, slug string) (*domain.Tenant, error) {
	if !strings.EqualFold(strings.TrimSpace(slug), DemoTenantSlug) {
		return nil, nil
	}
	return &domain.Tenant{ID: DemoTenantID, Slug: DemoTenantSlug, Name: DemoTenantName}, nil
}

// AuthenticateUser verifies fixture credentials. Fixtures are single-tenant, so
// tenantID is accepted for interface parity but not used to partition data; the
// returned user still carries the fixture tenant id.
func (s *FixtureStore) AuthenticateUser(
	ctx context.Context,
	tenantID string,
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
				TenantID: DemoTenantID,
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
			return &domain.User{ID: user.ID, Username: user.Username, Role: user.Role, TenantID: DemoTenantID}, nil
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

// Users returns the in-memory login fixtures, seeded once from users.json and
// mutated by the account-management methods.
func (s *FixtureStore) Users(_ context.Context) ([]domain.FixtureUser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureUsersLoadedLocked(); err != nil {
		return nil, err
	}
	return append([]domain.FixtureUser(nil), s.fixtureUsers...), nil
}

// ensureUsersLoadedLocked seeds the in-memory user slice from users.json once.
// The caller must hold s.mu.
func (s *FixtureStore) ensureUsersLoadedLocked() error {
	if s.usersLoaded {
		return nil
	}
	var users []domain.FixtureUser
	if err := s.readJSON("users.json", &users); err != nil {
		return err
	}
	s.fixtureUsers = users
	s.usersLoaded = true
	return nil
}

// Customers reads normalized customer fixture data, filtered and paginated to
// match the SQLite store.
func (s *FixtureStore) Customers(_ context.Context, query CustomerQuery) (CustomerListResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return CustomerListResult{}, err
	}

	search := strings.ToLower(strings.TrimSpace(query.Search))
	matched := make([]domain.Customer, 0, len(s.customers))
	for _, customer := range s.customers {
		if search != "" {
			hay := strings.ToLower(customer.Name + " " + ptrString(customer.Pib) + " " + ptrString(customer.Mb))
			if !strings.Contains(hay, search) {
				continue
			}
		}
		matched = append(matched, customer)
	}

	total := len(matched)
	matched = paginateCustomers(matched, query.Limit, query.Offset)
	return CustomerListResult{Items: cloneCustomers(matched), Total: total}, nil
}

func paginateCustomers(items []domain.Customer, limit int, offset int) []domain.Customer {
	if limit <= 0 {
		return items
	}
	if offset < 0 {
		offset = 0
	}
	if offset >= len(items) {
		return []domain.Customer{}
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	return items[offset:end]
}

func ptrString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// CustomerByID returns a single customer fixture or nil when not found.
func (s *FixtureStore) CustomerByID(_ context.Context, id string) (*domain.Customer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return nil, err
	}
	for _, customer := range s.customers {
		if customer.ID == id {
			cloned := cloneCustomer(customer)
			return &cloned, nil
		}
	}
	return nil, nil
}

// Locations reads normalized customer location fixture data.
func (s *FixtureStore) Locations(_ context.Context, customerID string) ([]domain.Location, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return nil, err
	}
	if customerID == "" {
		return cloneLocations(s.locations), nil
	}
	filtered := make([]domain.Location, 0)
	for _, location := range s.locations {
		if location.CustomerID == customerID {
			filtered = append(filtered, location)
		}
	}
	return cloneLocations(filtered), nil
}

func (s *FixtureStore) UpsertCustomer(
	_ context.Context,
	customer domain.Customer,
) (*domain.Customer, error) {
	if strings.TrimSpace(customer.ID) == "" || strings.TrimSpace(customer.Name) == "" {
		return nil, newValidationError(invalidWorkOrderMessage)
	}
	if msg := domain.ValidateCustomerIdentifiers(customer.Pib, customer.Mb); msg != "" {
		return nil, newValidationError(msg)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return nil, err
	}

	stored := cloneCustomer(customer)
	for index, candidate := range s.customers {
		if candidate.ID == customer.ID {
			s.customers[index] = stored
			result := cloneCustomer(stored)
			return &result, nil
		}
	}
	s.customers = append(s.customers, stored)
	result := cloneCustomer(stored)
	return &result, nil
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

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return nil, err
	}

	stored := cloneLocation(location)
	for index, candidate := range s.locations {
		if candidate.ID == location.ID {
			s.locations[index] = stored
			result := cloneLocation(stored)
			return &result, nil
		}
	}
	s.locations = append(s.locations, stored)
	result := cloneLocation(stored)
	return &result, nil
}

func (s *FixtureStore) DeleteCustomer(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return err
	}

	customers := make([]domain.Customer, 0, len(s.customers))
	for _, customer := range s.customers {
		if customer.ID != id {
			customers = append(customers, customer)
		}
	}
	s.customers = customers

	locations := make([]domain.Location, 0, len(s.locations))
	for _, location := range s.locations {
		if location.CustomerID != id {
			locations = append(locations, location)
		}
	}
	s.locations = locations

	return nil
}

func (s *FixtureStore) DeleteLocation(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureReferenceDataLoaded(); err != nil {
		return err
	}

	locations := make([]domain.Location, 0, len(s.locations))
	for _, location := range s.locations {
		if location.ID != id {
			locations = append(locations, location)
		}
	}
	s.locations = locations

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

// WorkOrderByPublicToken finds a work order by its public tracking token.
func (s *FixtureStore) WorkOrderByPublicToken(_ context.Context, token string) (*domain.WorkOrder, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}
	for _, workOrder := range s.workOrders {
		if workOrder.Communication.PublicToken == token {
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

	if err := validateCreateWorkOrderInput(input, s.customEnumSetLocked()); err != nil {
		return nil, err
	}

	sequence := s.nextSequence
	s.nextSequence++
	now := time.Now().UTC()
	orderNumber := s.resolveOrderNumberLocked(now.Year(), now, input.OrderNumber)
	createdAt := now.Format(time.RFC3339)
	newOrder := domain.WorkOrder{
		ID:                    strconv.Itoa(sequence),
		OrderNumber:           orderNumber,
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
		ExecutedBy:            input.ExecutedBy,
		Assignment:            normalizeAssignment(input.Assignment),
		IssueDate:             input.IssueDate,
		ProformaDueDate:       input.ProformaDueDate,
		DueDate:               input.DueDate,
		IsCompleted:           false,
		Status:                domain.WorkOrderStatusNew,
		Price:                 input.Price,
		Note:                  input.Note,
		CreatedAt:             createdAt,
		UpdatedAt:             createdAt,
		CompletionDate:        nil,
		StatusHistory: []domain.WorkOrderStatusHistory{
			{Status: domain.WorkOrderStatusNew, ChangedAt: createdAt, ChangedBy: input.IssuedBy},
		},
		InternalNotes: input.InternalNotes,
		CustomerNotes: input.CustomerNotes,
		Events: []domain.WorkOrderEvent{
			{ID: "event-created", Kind: "created", Label: "Nalog kreiran", Actor: input.IssuedBy, CreatedAt: createdAt},
		},
		Attachments:   input.Attachments,
		MaterialUsage: input.MaterialUsage,
		TimeEntries:   input.TimeEntries,
		InvoiceDraft:  normalizeInvoiceDraft(input.InvoiceDraft, input.JobDescription, input.Price),
		Communication: normalizeCommunication(input.Communication, sequence, nil),
	}

	costs := s.catalogPurchasePricesLocked(catalogItemIDs(newOrder.InvoiceDraft.LineItems))
	newOrder.InvoiceDraft.LineItems, newOrder.Profit, newOrder.NeedsCostReview = applyLineItemCosts(
		newOrder.InvoiceDraft.LineItems, costs, nil, costModeCreate,
	)
	if newOrder.NeedsCostReview {
		newOrder.Events = applyCostReviewEvents(newOrder.Events, false, true, input.IssuedBy, createdAt)
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

		updated, err := applyWorkOrderChanges(workOrder, changes, s.customEnumSetLocked())
		if err != nil {
			return nil, err
		}

		updated.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		// The fixture store has no cost history, so the current catalog price is
		// the as-of cost; the create/completion/preserve modes still apply.
		mode := costModePreserve
		if !workOrder.IsCompleted && updated.IsCompleted {
			mode = costModeCompletion
		}
		costs := s.catalogPurchasePricesLocked(catalogItemIDs(updated.InvoiceDraft.LineItems))
		wasNeeded := workOrder.NeedsCostReview
		updated.InvoiceDraft.LineItems, updated.Profit, updated.NeedsCostReview = applyLineItemCosts(
			updated.InvoiceDraft.LineItems, costs, workOrder.InvoiceDraft.LineItems, mode,
		)
		actor := updated.IssuedBy
		if updated.ExecutedBy != nil && *updated.ExecutedBy != "" {
			actor = *updated.ExecutedBy
		}
		updated.Events = applyCostReviewEvents(updated.Events, wasNeeded, updated.NeedsCostReview, actor, updated.UpdatedAt)
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
// Operators returns the usernames of registered operator users (role "user"),
// sorted — the assignable-operator list for the work-order operator selects.
func (s *FixtureStore) Operators(_ context.Context) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureUsersLoadedLocked(); err != nil {
		return nil, err
	}

	operators := make([]string, 0, len(s.fixtureUsers))
	for _, user := range s.fixtureUsers {
		if user.Role == domain.RoleUser || user.Role == domain.RoleAdmin {
			operators = append(operators, user.Username)
		}
	}

	sort.Strings(operators)
	return operators, nil
}

// customEnumSetLocked builds the custom-value lookup. Callers must already hold
// s.mu.
func (s *FixtureStore) customEnumSetLocked() customEnumSet {
	return customEnumSetFromValues(s.enumValues)
}

// EnumValues returns the built-in defaults merged with admin-created values.
func (s *FixtureStore) EnumValues(_ context.Context) ([]domain.EnumValue, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return mergeEnumValues(cloneEnumValues(s.enumValues)), nil
}

// CreateEnumValue stores a new custom value for a managed field.
func (s *FixtureStore) CreateEnumValue(
	_ context.Context,
	input domain.EnumValueInput,
) (*domain.EnumValue, error) {
	input = normalizeEnumValueInput(input)
	if err := validateEnumValueInput(input); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, existing := range s.enumValues {
		if existing.Field == input.Field && existing.Value == input.Value {
			return nil, newValidationError("Vrednost sa istom šifrom već postoji.")
		}
	}

	s.nextEnumSequence++
	now := time.Now().UTC().Format(time.RFC3339)
	value := domain.EnumValue{
		ID:        fmt.Sprintf("enum-%d", s.nextEnumSequence),
		Field:     input.Field,
		Value:     input.Value,
		Label:     input.Label,
		SortOrder: input.SortOrder,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.enumValues = append(s.enumValues, value)
	clone := value
	return &clone, nil
}

// UpdateEnumValue edits an existing custom value. Built-in values cannot be
// edited because they are never stored here.
func (s *FixtureStore) UpdateEnumValue(
	_ context.Context,
	id string,
	input domain.EnumValueInput,
) (*domain.EnumValue, error) {
	input = normalizeEnumValueInput(input)

	s.mu.Lock()
	defer s.mu.Unlock()

	for index, existing := range s.enumValues {
		if existing.ID != id {
			continue
		}
		candidate := domain.EnumValueInput{
			Field:     existing.Field,
			Value:     input.Value,
			Label:     input.Label,
			SortOrder: input.SortOrder,
		}
		if err := validateEnumValueInput(candidate); err != nil {
			return nil, err
		}
		for otherIndex, other := range s.enumValues {
			if otherIndex != index && other.Field == existing.Field && other.Value == candidate.Value {
				return nil, newValidationError("Vrednost sa istom šifrom već postoji.")
			}
		}
		existing.Value = candidate.Value
		existing.Label = candidate.Label
		existing.SortOrder = candidate.SortOrder
		existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		s.enumValues[index] = existing
		clone := existing
		return &clone, nil
	}

	return nil, nil
}

// DeleteEnumValue removes a custom value by id.
func (s *FixtureStore) DeleteEnumValue(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	remaining := make([]domain.EnumValue, 0, len(s.enumValues))
	for _, existing := range s.enumValues {
		if existing.ID != id {
			remaining = append(remaining, existing)
		}
	}
	s.enumValues = remaining
	return nil
}

func cloneEnumValues(values []domain.EnumValue) []domain.EnumValue {
	cloned := make([]domain.EnumValue, len(values))
	copy(cloned, values)
	return cloned
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
		if query.NeedsCostReview && !workOrder.NeedsCostReview {
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
	if err := s.ensureReferenceDataLoaded(); err != nil {
		return err
	}

	s.workOrders = make([]domain.WorkOrder, len(rawOrders))
	for index, rawOrder := range rawOrders {
		s.workOrders[index] = normalizeWorkOrder(rawOrder, s.customers, s.locations)
	}
	s.nextSequence = nextSequenceStart(s.workOrders)
	s.loaded = true

	return nil
}

func (s *FixtureStore) ensureReferenceDataLoaded() error {
	if s.referencesLoaded {
		return nil
	}

	var customers []domain.Customer
	if err := s.readJSON("customers.json", &customers); err != nil {
		return err
	}

	var locations []domain.Location
	if err := s.readJSON("locations.json", &locations); err != nil {
		return err
	}

	s.customers = cloneCustomers(customers)
	s.locations = cloneLocations(locations)
	s.referencesLoaded = true
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
	case domain.WorkOrderStatusActive,
		// Retired "waiting" statuses collapse into inProgress for older data.
		domain.WorkOrderStatusWaitingForCustomer,
		domain.WorkOrderStatusWaitingForMaterials:
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

// formatOrderNumber renders the canonical RN-<year>-<seq> order number. Order
// numbers are scoped per calendar year and carry their own UNIQUE constraint —
// they are deliberately independent of the work-order id, which may be
// non-numeric (e.g. a seeded "wo-cob-1"). Deriving them from the id sequence is
// what caused duplicate order numbers when the id wasn't a dense integer.
func formatOrderNumber(year, sequence int) string {
	return fmt.Sprintf("RN-%d-%05d", year, sequence)
}

// orderNumberSequence extracts the trailing sequence from an RN-<year>-<seq>
// order number for the given year, reporting false when it doesn't match.
func orderNumberSequence(orderNumber string, year int) (int, bool) {
	rest, ok := strings.CutPrefix(orderNumber, fmt.Sprintf("RN-%d-", year))
	if !ok {
		return 0, false
	}
	seq, err := strconv.Atoi(rest)
	if err != nil {
		return 0, false
	}
	return seq, true
}

// ReserveOrderNumber atomically claims the next order number and records it in
// the in-memory ledger so concurrent operators each see a distinct number in
// their create-form header before any work order is saved.
func (s *FixtureStore) ReserveOrderNumber(_ context.Context, reservedBy string) (domain.ReservedOrderNumber, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return domain.ReservedOrderNumber{}, err
	}
	if strings.TrimSpace(reservedBy) == "" {
		return domain.ReservedOrderNumber{}, newValidationError(invalidWorkOrderMessage)
	}

	now := time.Now().UTC()
	s.pruneReservationsLocked(now)
	year := now.Year()
	orderNumber := s.nextOrderNumberLocked(year, now)
	sequence, _ := orderNumberSequence(orderNumber, year)
	expiresAt := now.Add(reservationTTL)
	s.reservations = append(s.reservations, fixtureReservation{
		orderNumber: orderNumber,
		year:        year,
		sequence:    sequence,
		expiresAt:   expiresAt,
	})
	return domain.ReservedOrderNumber{
		OrderNumber: orderNumber,
		ExpiresAt:   expiresAt.Format(time.RFC3339),
	}, nil
}

// ReleaseOrderNumber drops a still-active reservation so its number is reclaimed
// immediately when an operator cancels the create form. Unknown numbers are a
// no-op.
func (s *FixtureStore) ReleaseOrderNumber(_ context.Context, orderNumber string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	orderNumber = strings.TrimSpace(orderNumber)
	if orderNumber == "" {
		return nil
	}
	kept := s.reservations[:0]
	for _, reservation := range s.reservations {
		if reservation.orderNumber != orderNumber {
			kept = append(kept, reservation)
		}
	}
	s.reservations = kept
	return nil
}

// AcquireEditLock claims or refreshes the exclusive edit lock on a work order,
// mirroring the SQLite store: expired locks are pruned, the lock is taken when
// free or already held by the caller, otherwise the current holder is reported
// with acquired=false.
func (s *FixtureStore) AcquireEditLock(_ context.Context, workOrderID, lockedBy string) (domain.EditLock, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	workOrderID = strings.TrimSpace(workOrderID)
	lockedBy = strings.TrimSpace(lockedBy)
	if workOrderID == "" || lockedBy == "" {
		return domain.EditLock{}, false, newValidationError(invalidWorkOrderMessage)
	}
	if s.editLocks == nil {
		s.editLocks = make(map[string]fixtureEditLock)
	}
	now := time.Now().UTC()
	existing, ok := s.editLocks[workOrderID]
	if ok && !existing.expiresAt.After(now) {
		ok = false // expired: treat as free
	}
	if ok && existing.lockedBy != lockedBy {
		return domain.EditLock{
			WorkOrderID: workOrderID,
			LockedBy:    existing.lockedBy,
			LockedAt:    existing.lockedAt.Format(time.RFC3339),
		}, false, nil
	}
	lockedAt := now
	if ok {
		lockedAt = existing.lockedAt
	}
	expiresAt := now.Add(editLockTTL)
	s.editLocks[workOrderID] = fixtureEditLock{
		lockedBy:  lockedBy,
		lockedAt:  lockedAt,
		expiresAt: expiresAt,
	}
	return domain.EditLock{
		WorkOrderID: workOrderID,
		LockedBy:    lockedBy,
		LockedAt:    lockedAt.Format(time.RFC3339),
		ExpiresAt:   expiresAt.Format(time.RFC3339),
	}, true, nil
}

// ReleaseEditLock frees the caller's edit lock, leaving a lock a new holder has
// since taken untouched.
func (s *FixtureStore) ReleaseEditLock(_ context.Context, workOrderID, lockedBy string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	workOrderID = strings.TrimSpace(workOrderID)
	lockedBy = strings.TrimSpace(lockedBy)
	if workOrderID == "" || lockedBy == "" {
		return nil
	}
	if existing, ok := s.editLocks[workOrderID]; ok && existing.lockedBy == lockedBy {
		delete(s.editLocks, workOrderID)
	}
	return nil
}

// nextOrderNumberLocked returns the next free order number for year, taking the
// max sequence across committed work orders and still-active reservations so a
// number handed to another open form is never allocated twice.
func (s *FixtureStore) nextOrderNumberLocked(year int, now time.Time) string {
	maxSeq := 0
	for _, workOrder := range s.workOrders {
		if seq, ok := orderNumberSequence(workOrder.OrderNumber, year); ok && seq > maxSeq {
			maxSeq = seq
		}
	}
	for _, reservation := range s.reservations {
		if reservation.year == year && reservation.expiresAt.After(now) && reservation.sequence > maxSeq {
			maxSeq = reservation.sequence
		}
	}
	return formatOrderNumber(year, maxSeq+1)
}

// resolveOrderNumberLocked honors a requested (reserved) number when its
// reservation still stands and no committed order has claimed it, consuming the
// reservation; otherwise it allocates a fresh number.
func (s *FixtureStore) resolveOrderNumberLocked(year int, now time.Time, requested *string) string {
	if requested != nil {
		candidate := strings.TrimSpace(*requested)
		if candidate != "" && s.reservationHonoredLocked(candidate) {
			s.removeReservationLocked(candidate)
			return candidate
		}
	}
	return s.nextOrderNumberLocked(year, now)
}

func (s *FixtureStore) reservationHonoredLocked(orderNumber string) bool {
	reserved := false
	for _, reservation := range s.reservations {
		if reservation.orderNumber == orderNumber {
			reserved = true
			break
		}
	}
	if !reserved {
		return false
	}
	for _, workOrder := range s.workOrders {
		if workOrder.OrderNumber == orderNumber {
			return false
		}
	}
	return true
}

func (s *FixtureStore) removeReservationLocked(orderNumber string) {
	kept := s.reservations[:0]
	for _, reservation := range s.reservations {
		if reservation.orderNumber != orderNumber {
			kept = append(kept, reservation)
		}
	}
	s.reservations = kept
}

func (s *FixtureStore) pruneReservationsLocked(now time.Time) {
	kept := s.reservations[:0]
	for _, reservation := range s.reservations {
		if reservation.expiresAt.After(now) {
			kept = append(kept, reservation)
		}
	}
	s.reservations = kept
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

func normalizeInvoiceLineItems(items []domain.InvoiceLineItem) []domain.InvoiceLineItem {
	if items == nil {
		return []domain.InvoiceLineItem{}
	}
	for index := range items {
		if items[index].ID == "" {
			items[index].ID = fmt.Sprintf("line-%d", index+1)
		}
		if items[index].Kind == "" {
			items[index].Kind = domain.InvoiceLineItemKindService
		}
		if items[index].Unit == "" || !isInvoiceUnitAllowed(items[index].Kind, items[index].Unit) {
			items[index].Unit = domain.InvoiceUnitKom
		}
		if items[index].Quantity == 0 {
			items[index].Quantity = 1
		}
	}
	return items
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
			{
				ID:          "line-1",
				Kind:        domain.InvoiceLineItemKindService,
				Description: jobDescription,
				Quantity:    1,
				Unit:        domain.InvoiceUnitKom,
				UnitPrice:   *price,
			},
		}
	}
	normalized.LineItems = normalizeInvoiceLineItems(normalized.LineItems)
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

func validateCreateWorkOrderInput(input domain.CreateWorkOrderInput, custom customEnumSet) error {
	if strings.TrimSpace(input.ClientName) == "" ||
		strings.TrimSpace(input.JobDescription) == "" ||
		strings.TrimSpace(input.IssuedBy) == "" ||
		strings.TrimSpace(input.IssueDate) == "" {
		return newValidationError(invalidWorkOrderMessage)
	}

	if err := validateShipping(input.Shipping, custom); err != nil {
		return err
	}
	if err := validateBillingDocumentType(input.BillingDocumentType, custom); err != nil {
		return err
	}
	if err := validateAssignment(input.Assignment, custom); err != nil {
		return err
	}
	if err := validateInvoiceDraft(input.InvoiceDraft, custom); err != nil {
		return err
	}

	return nil
}

func applyWorkOrderChanges(
	current domain.WorkOrder,
	changes domain.UpdateWorkOrderInput,
	custom customEnumSet,
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
			if err := validateBillingDocumentType(value, custom); err != nil {
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
			if err := validateShipping(value, custom); err != nil {
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
			if err := validateAssignment(value, custom); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.Assignment = normalizeAssignment(value)
		case "issueDate":
			var value string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.IssueDate = value
		case "proformaDueDate":
			var value *string
			if err := decodeField(raw, &value); err != nil {
				return domain.WorkOrder{}, err
			}
			updated.ProformaDueDate = value
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
			if err := validateInvoiceDraft(value, custom); err != nil {
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

	appendWorkOrderChangeEvents(&current, &updated)

	// issuedBy is required when *creating* an order, but seeded/imported/legacy
	// orders may have it blank. Don't block edits (status changes, etc.) to an
	// existing order just because it lacks an issuer — validate with a sentinel
	// so the create-time non-empty check passes; the stored value is untouched.
	validationIssuedBy := updated.IssuedBy
	if strings.TrimSpace(validationIssuedBy) == "" {
		validationIssuedBy = "—"
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
		IssuedBy:              validationIssuedBy,
		IssueDate:             updated.IssueDate,
		ProformaDueDate:       updated.ProformaDueDate,
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
	}, custom); err != nil {
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

func validateShipping(shipping domain.Shipping, custom customEnumSet) error {
	if shipping.DeliveryMethod != nil && !isValidDeliveryMethod(*shipping.DeliveryMethod, custom) {
		return newValidationError(invalidWorkOrderMessage)
	}
	if shipping.PostagePaymentType != nil && !isValidPostagePaymentType(*shipping.PostagePaymentType, custom) {
		return newValidationError(invalidWorkOrderMessage)
	}

	return nil
}

func isValidPostagePaymentType(value domain.PostagePaymentType, custom customEnumSet) bool {
	switch value {
	case domain.PostagePaymentTypeCOD,
		domain.PostagePaymentTypeOurAccount,
		domain.PostagePaymentTypeAdvance,
		domain.PostagePaymentTypeViaInvoice:
		return true
	default:
		return custom.has(domain.EnumFieldPostagePaymentType, string(value))
	}
}

func validateBillingDocumentType(value *domain.BillingDocumentType, custom customEnumSet) error {
	if value != nil && !isValidBillingDocumentType(*value, custom) {
		return newValidationError(invalidWorkOrderMessage)
	}

	return nil
}

func validateAssignment(value domain.Assignment, custom customEnumSet) error {
	if value.Priority != "" && !isValidPriority(value.Priority, custom) {
		return newValidationError(invalidWorkOrderMessage)
	}
	return nil
}

func validateInvoiceDraft(value domain.InvoiceDraft, custom customEnumSet) error {
	if value.Status != "" && !isValidInvoiceDraftStatus(value.Status) {
		return newValidationError(invalidWorkOrderMessage)
	}
	for _, line := range value.LineItems {
		if line.Kind != "" && !isValidInvoiceLineItemKind(line.Kind) {
			return newValidationError(invalidWorkOrderMessage)
		}
		if line.Unit != "" && !isValidInvoiceUnit(line.Unit, custom) {
			return newValidationError(invalidWorkOrderMessage)
		}
		if line.Kind != "" && line.Unit != "" && !isInvoiceUnitAllowed(line.Kind, line.Unit) {
			return newValidationError(invalidWorkOrderMessage)
		}
	}
	return nil
}

func isValidDeliveryMethod(value domain.DeliveryMethod, custom customEnumSet) bool {
	switch value {
	case domain.DeliveryMethodPickup,
		domain.DeliveryMethodPostExpress,
		domain.DeliveryMethodCityExpress,
		domain.DeliveryMethodFieldVisit:
		return true
	default:
		return custom.has(domain.EnumFieldDeliveryMethod, string(value))
	}
}

func isValidBillingDocumentType(value domain.BillingDocumentType, custom customEnumSet) bool {
	switch value {
	case domain.BillingDocumentTypeInvoice,
		domain.BillingDocumentTypeCashCollection,
		domain.BillingDocumentTypeProforma:
		return true
	default:
		return custom.has(domain.EnumFieldBillingDocumentType, string(value))
	}
}

func isValidStatus(value domain.WorkOrderStatus) bool {
	switch value {
	case domain.WorkOrderStatusNew,
		domain.WorkOrderStatusAssigned,
		domain.WorkOrderStatusInProgress,
		domain.WorkOrderStatusCompleted,
		domain.WorkOrderStatusCancelled,
		domain.WorkOrderStatusInvoiced:
		return true
	default:
		return false
	}
}

func isValidPriority(value domain.WorkOrderPriority, custom customEnumSet) bool {
	switch value {
	case domain.WorkOrderPriorityLow,
		domain.WorkOrderPriorityNormal,
		domain.WorkOrderPriorityHigh,
		domain.WorkOrderPriorityUrgent:
		return true
	default:
		return custom.has(domain.EnumFieldPriority, string(value))
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

func isValidInvoiceLineItemKind(value domain.InvoiceLineItemKind) bool {
	switch value {
	case domain.InvoiceLineItemKindService,
		domain.InvoiceLineItemKindGoods:
		return true
	default:
		return false
	}
}

func isValidInvoiceUnit(value domain.InvoiceUnit, custom customEnumSet) bool {
	switch value {
	case domain.InvoiceUnitKom,
		domain.InvoiceUnitM2,
		domain.InvoiceUnitSet:
		return true
	default:
		return custom.has(domain.EnumFieldInvoiceUnit, string(value))
	}
}

func isInvoiceUnitAllowed(kind domain.InvoiceLineItemKind, unit domain.InvoiceUnit) bool {
	return kind == domain.InvoiceLineItemKindService || unit != domain.InvoiceUnitSet
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
			domain.WorkOrderStatusCancelled,
		},
		domain.WorkOrderStatusInProgress: {
			domain.WorkOrderStatusCompleted,
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

// emptyDiffValue renders a missing/blank value in change-event diffs.
const emptyDiffValue = "—"

func workOrderPriorityLabel(priority domain.WorkOrderPriority) string {
	switch priority {
	case domain.WorkOrderPriorityLow:
		return "Nizak"
	case domain.WorkOrderPriorityNormal:
		return "Normalan"
	case domain.WorkOrderPriorityHigh:
		return "Visok"
	case domain.WorkOrderPriorityUrgent:
		return "Hitno"
	default:
		return string(priority)
	}
}

func billingDocumentTypeLabel(docType *domain.BillingDocumentType) string {
	if docType == nil {
		return emptyDiffValue
	}
	switch *docType {
	case domain.BillingDocumentTypeInvoice:
		return "Faktura"
	case domain.BillingDocumentTypeCashCollection:
		return "Gotovinski račun"
	case domain.BillingDocumentTypeProforma:
		return "Profaktura"
	default:
		return string(*docType)
	}
}

func deliveryMethodLabel(method *domain.DeliveryMethod) string {
	if method == nil {
		return emptyDiffValue
	}
	switch *method {
	case domain.DeliveryMethodPickup:
		return "Lično preuzimanje"
	case domain.DeliveryMethodPostExpress:
		return "Post Express"
	case domain.DeliveryMethodCityExpress:
		return "City Express"
	case domain.DeliveryMethodFieldVisit:
		return "Terenski obilazak"
	default:
		return string(*method)
	}
}

func diffOptionalString(value *string) string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return emptyDiffValue
	}
	return *value
}

// diffDate renders a YYYY-MM-DD value as DD.MM.YYYY, matching the UI.
func diffDate(value *string) string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return emptyDiffValue
	}
	parsed, err := time.Parse("2006-01-02", *value)
	if err != nil {
		return *value
	}
	return parsed.Format("02.01.2006")
}

// diffPrice renders a RSD amount with sr-Latn grouping ("67.000 RSD").
func diffPrice(price *float64) string {
	if price == nil {
		return emptyDiffValue
	}
	value := *price
	negative := value < 0
	if negative {
		value = -value
	}
	whole := int64(value)
	grouped := strconv.FormatInt(whole, 10)
	var b strings.Builder
	n := len(grouped)
	for i, digit := range grouped {
		if i > 0 && (n-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(digit)
	}
	out := b.String()
	if frac := value - float64(whole); frac > 0 {
		decimals := strings.TrimRight(strconv.FormatFloat(frac, 'f', 2, 64)[2:], "0")
		if decimals != "" {
			out += "," + decimals
		}
	}
	if negative {
		out = "-" + out
	}
	return out + " RSD"
}

// appendWorkOrderChangeEvents records a "change" timeline event for each
// user-facing field that differs between the pre-edit and post-edit work order.
// Status changes are intentionally excluded — applyStatus already logs those.
func appendWorkOrderChangeEvents(current, updated *domain.WorkOrder) {
	type fieldDiff struct{ label, before, after string }
	diffs := make([]fieldDiff, 0)
	add := func(label, before, after string) {
		if before != after {
			diffs = append(diffs, fieldDiff{label, before, after})
		}
	}

	add("Naziv klijenta", current.ClientName, updated.ClientName)
	add("Kontakt osoba", diffOptionalString(current.ContactPerson), diffOptionalString(updated.ContactPerson))
	add("Opis posla", current.JobDescription, updated.JobDescription)
	add("Tip dokumenta", billingDocumentTypeLabel(current.BillingDocumentType), billingDocumentTypeLabel(updated.BillingDocumentType))
	add("Broj dokumenta", diffOptionalString(current.BillingDocumentNumber), diffOptionalString(updated.BillingDocumentNumber))
	add("Operater", diffOptionalString(current.Assignment.AssignedTo), diffOptionalString(updated.Assignment.AssignedTo))
	add("Prioritet", workOrderPriorityLabel(current.Assignment.Priority), workOrderPriorityLabel(updated.Assignment.Priority))
	add("Način dostave", deliveryMethodLabel(current.Shipping.DeliveryMethod), deliveryMethodLabel(updated.Shipping.DeliveryMethod))
	add("Datum izdavanja", diffDate(&current.IssueDate), diffDate(&updated.IssueDate))
	add("Rok izdavanja predračuna", diffDate(current.ProformaDueDate), diffDate(updated.ProformaDueDate))
	add("Rok završetka posla", diffDate(current.DueDate), diffDate(updated.DueDate))
	add("Cena", diffPrice(current.Price), diffPrice(updated.Price))
	add("Napomena", diffOptionalString(current.Note), diffOptionalString(updated.Note))

	now := time.Now().UTC().Format(time.RFC3339)
	for _, d := range diffs {
		updated.Events = append(updated.Events, domain.WorkOrderEvent{
			ID:        fmt.Sprintf("event-%d", len(updated.Events)+1),
			Kind:      "change",
			Label:     fmt.Sprintf("%s: %s → %s", d.label, d.before, d.after),
			Actor:     updated.IssuedBy,
			CreatedAt: now,
		})
	}
}

func workOrderStatusLabel(status domain.WorkOrderStatus) string {
	switch status {
	case domain.WorkOrderStatusNew:
		return "Nov"
	case domain.WorkOrderStatusAssigned:
		return "Dodeljen"
	case domain.WorkOrderStatusInProgress:
		return "U toku"
	case domain.WorkOrderStatusWaitingForCustomer:
		return "Čeka klijenta"
	case domain.WorkOrderStatusWaitingForMaterials:
		return "Čeka materijal"
	case domain.WorkOrderStatusCompleted:
		return "Završen"
	case domain.WorkOrderStatusCancelled:
		return "Otkazan"
	case domain.WorkOrderStatusInvoiced:
		return "Fakturisan"
	default:
		return string(status)
	}
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
		Label:     fmt.Sprintf("Status promenjen na %s", workOrderStatusLabel(status)),
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

func cloneCustomers(customers []domain.Customer) []domain.Customer {
	cloned := make([]domain.Customer, len(customers))
	for index, customer := range customers {
		cloned[index] = cloneCustomer(customer)
	}
	return cloned
}

func cloneCustomer(customer domain.Customer) domain.Customer {
	cloned := customer
	cloned.ContactName = clonePtrString(customer.ContactName)
	cloned.Email = clonePtrString(customer.Email)
	cloned.Phone = clonePtrString(customer.Phone)
	cloned.Pib = clonePtrString(customer.Pib)
	cloned.Mb = clonePtrString(customer.Mb)
	cloned.Emails = cloneCustomerEmails(customer.Emails)
	cloned.Contacts = cloneCustomerContacts(customer.Contacts)
	return cloned
}

// cloneCustomerEmails deep-copies the slice and always returns a non-nil value
// so the JSON shape stays an array even for customers without emails.
func cloneCustomerEmails(emails []domain.CustomerEmail) []domain.CustomerEmail {
	cloned := make([]domain.CustomerEmail, len(emails))
	for i, email := range emails {
		email.Label = clonePtrString(email.Label)
		cloned[i] = email
	}
	return cloned
}

func cloneCustomerContacts(contacts []domain.CustomerContact) []domain.CustomerContact {
	cloned := make([]domain.CustomerContact, len(contacts))
	for i, contact := range contacts {
		contact.Email = clonePtrString(contact.Email)
		contact.Phone = clonePtrString(contact.Phone)
		contact.Role = clonePtrString(contact.Role)
		cloned[i] = contact
	}
	return cloned
}

func cloneLocations(locations []domain.Location) []domain.Location {
	cloned := make([]domain.Location, len(locations))
	for index, location := range locations {
		cloned[index] = cloneLocation(location)
	}
	return cloned
}

func cloneLocation(location domain.Location) domain.Location {
	cloned := location
	cloned.Address = clonePtrString(location.Address)
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
	cloned.ProformaDueDate = clonePtrString(workOrder.ProformaDueDate)
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
	cloned.PostagePaymentType = clonePtrPostagePaymentType(value.PostagePaymentType)
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

func clonePtrPostagePaymentType(value *domain.PostagePaymentType) *domain.PostagePaymentType {
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
