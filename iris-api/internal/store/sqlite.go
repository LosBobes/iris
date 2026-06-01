package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type SQLiteStore struct {
	db *sql.DB
}

func OpenSQLite(ctx context.Context, path string) (*SQLiteStore, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("sqlite path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite directory: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := configureSQLite(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := RunMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &SQLiteStore{db: db}, nil
}

func configureSQLite(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `PRAGMA busy_timeout = 5000`); err != nil {
		return fmt.Errorf("set sqlite busy timeout: %w", err)
	}
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		return fmt.Errorf("enable sqlite foreign keys: %w", err)
	}

	var journalMode string
	if err := db.QueryRowContext(ctx, `PRAGMA journal_mode = WAL`).Scan(&journalMode); err != nil {
		return fmt.Errorf("enable sqlite WAL: %w", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		return fmt.Errorf("enable sqlite WAL: journal mode is %q", journalMode)
	}
	return nil
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

func (s *SQLiteStore) AuthenticateUser(
	ctx context.Context,
	username string,
	password string,
) (*domain.User, error) {
	var user domain.User
	var passwordHash string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username, role, password_hash FROM users WHERE username = ?`,
		username,
	).Scan(&user.ID, &user.Username, &user.Role, &passwordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return nil, nil
	}
	return &user, nil
}

func (s *SQLiteStore) CreateSession(
	ctx context.Context,
	userID string,
	expiresAt time.Time,
) (string, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)`,
		token,
		userID,
		expiresAt.UTC().Format(time.RFC3339),
	); err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

func (s *SQLiteStore) UserBySessionToken(ctx context.Context, token string) (*domain.User, error) {
	var user domain.User
	var expiresAtRaw string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT users.id, users.username, users.role, sessions.expires_at
		 FROM sessions
		 JOIN users ON users.id = sessions.user_id
		 WHERE sessions.token = ?`,
		token,
	).Scan(&user.ID, &user.Username, &user.Role, &expiresAtRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load session: %w", err)
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresAtRaw)
	if err != nil || time.Now().UTC().After(expiresAt) {
		_ = s.DeleteSession(ctx, token)
		return nil, nil
	}
	return &user, nil
}

func (s *SQLiteStore) DeleteSession(ctx context.Context, token string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token = ?`, token); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *SQLiteStore) Customers(ctx context.Context) ([]domain.Customer, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, name, contact_name, email, phone FROM customers ORDER BY name COLLATE NOCASE`,
	)
	if err != nil {
		return nil, fmt.Errorf("list customers: %w", err)
	}
	defer rows.Close()

	customers := make([]domain.Customer, 0)
	for rows.Next() {
		var customer domain.Customer
		var contactName, email, phone sql.NullString
		if err := rows.Scan(&customer.ID, &customer.Name, &contactName, &email, &phone); err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		customer.ContactName = nullStringPtr(contactName)
		customer.Email = nullStringPtr(email)
		customer.Phone = nullStringPtr(phone)
		customers = append(customers, customer)
	}
	return customers, rows.Err()
}

func (s *SQLiteStore) Locations(ctx context.Context) ([]domain.Location, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, customer_id, name, address FROM locations ORDER BY name COLLATE NOCASE`,
	)
	if err != nil {
		return nil, fmt.Errorf("list locations: %w", err)
	}
	defer rows.Close()

	locations := make([]domain.Location, 0)
	for rows.Next() {
		var location domain.Location
		var address sql.NullString
		if err := rows.Scan(&location.ID, &location.CustomerID, &location.Name, &address); err != nil {
			return nil, fmt.Errorf("scan location: %w", err)
		}
		location.Address = nullStringPtr(address)
		locations = append(locations, location)
	}
	return locations, rows.Err()
}

func (s *SQLiteStore) UpsertCustomer(
	ctx context.Context,
	customer domain.Customer,
) (*domain.Customer, error) {
	if strings.TrimSpace(customer.ID) == "" || strings.TrimSpace(customer.Name) == "" {
		return nil, newValidationError(invalidWorkOrderMessage)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO customers(id, name, contact_name, email, phone, updated_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   name = excluded.name,
		   contact_name = excluded.contact_name,
		   email = excluded.email,
		   phone = excluded.phone,
		   updated_at = CURRENT_TIMESTAMP`,
		customer.ID,
		customer.Name,
		ptrStringValue(customer.ContactName),
		ptrStringValue(customer.Email),
		ptrStringValue(customer.Phone),
	); err != nil {
		return nil, fmt.Errorf("upsert customer: %w", err)
	}
	return &customer, nil
}

func (s *SQLiteStore) UpsertLocation(
	ctx context.Context,
	location domain.Location,
) (*domain.Location, error) {
	if strings.TrimSpace(location.ID) == "" ||
		strings.TrimSpace(location.CustomerID) == "" ||
		strings.TrimSpace(location.Name) == "" {
		return nil, newValidationError(invalidWorkOrderMessage)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO locations(id, customer_id, name, address, updated_at)
		 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   customer_id = excluded.customer_id,
		   name = excluded.name,
		   address = excluded.address,
		   updated_at = CURRENT_TIMESTAMP`,
		location.ID,
		location.CustomerID,
		location.Name,
		ptrStringValue(location.Address),
	); err != nil {
		return nil, fmt.Errorf("upsert location: %w", err)
	}
	return &location, nil
}

func (s *SQLiteStore) DeleteCustomer(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM customers WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete customer: %w", err)
	}
	return nil
}

func (s *SQLiteStore) DeleteLocation(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM locations WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete location: %w", err)
	}
	return nil
}

func (s *SQLiteStore) WorkOrders(
	ctx context.Context,
	query WorkOrderListQuery,
) (WorkOrderListResult, error) {
	where, args := buildWorkOrderWhere(query)
	var total int
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM work_orders `+where,
		args...,
	).Scan(&total); err != nil {
		return WorkOrderListResult{}, fmt.Errorf("count work orders: %w", err)
	}

	sqlQuery := `SELECT payload FROM work_orders ` + where + ` ` + workOrderOrderBy(query.Sort)
	if query.Limit > 0 {
		sqlQuery += ` LIMIT ? OFFSET ?`
		args = append(args, query.Limit, maxInt(query.Offset, 0))
	}
	rows, err := s.db.QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		return WorkOrderListResult{}, fmt.Errorf("list work orders: %w", err)
	}
	defer rows.Close()

	items := make([]domain.WorkOrder, 0)
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return WorkOrderListResult{}, fmt.Errorf("scan work order: %w", err)
		}
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
			return WorkOrderListResult{}, fmt.Errorf("decode work order payload: %w", err)
		}
		items = append(items, workOrder)
	}
	if err := rows.Err(); err != nil {
		return WorkOrderListResult{}, err
	}

	return WorkOrderListResult{Items: items, Total: total}, nil
}

func (s *SQLiteStore) WorkOrderByID(ctx context.Context, id string) (*domain.WorkOrder, error) {
	var payload string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT payload FROM work_orders WHERE id = ?`,
		id,
	).Scan(&payload)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load work order: %w", err)
	}
	var workOrder domain.WorkOrder
	if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
		return nil, fmt.Errorf("decode work order payload: %w", err)
	}
	return &workOrder, nil
}

func (s *SQLiteStore) CreateWorkOrder(
	ctx context.Context,
	input domain.CreateWorkOrderInput,
) (*domain.WorkOrder, error) {
	if err := validateCreateWorkOrderInput(input); err != nil {
		return nil, err
	}

	sequence, err := s.nextSequence(ctx)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	workOrder := domain.WorkOrder{
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

	if err := s.PutWorkOrder(ctx, workOrder); err != nil {
		return nil, err
	}
	return cloneWorkOrder(workOrder), nil
}

func (s *SQLiteStore) UpdateWorkOrder(
	ctx context.Context,
	id string,
	changes domain.UpdateWorkOrderInput,
) (*domain.WorkOrder, error) {
	current, err := s.WorkOrderByID(ctx, id)
	if err != nil || current == nil {
		return current, err
	}
	updated, err := applyWorkOrderChanges(*current, changes)
	if err != nil {
		return nil, err
	}
	updated.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := s.PutWorkOrder(ctx, updated); err != nil {
		return nil, err
	}
	return cloneWorkOrder(updated), nil
}

func (s *SQLiteStore) DeleteWorkOrder(
	ctx context.Context,
	id string,
) (domain.DeleteWorkOrderResponse, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM work_orders WHERE id = ?`, id)
	if err != nil {
		return domain.DeleteWorkOrderResponse{}, fmt.Errorf("delete work order: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return domain.DeleteWorkOrderResponse{}, fmt.Errorf("delete work order rows: %w", err)
	}
	if rows == 0 {
		return domain.DeleteWorkOrderResponse{Success: false, Message: "Radni nalog nije pronađen."}, nil
	}
	return domain.DeleteWorkOrderResponse{Success: true}, nil
}

func (s *SQLiteStore) Operators(ctx context.Context) ([]string, error) {
	result, err := s.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(result.Items))
	operators := make([]string, 0, len(result.Items))
	for _, workOrder := range result.Items {
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

func (s *SQLiteStore) PutWorkOrder(ctx context.Context, workOrder domain.WorkOrder) error {
	payload, err := json.Marshal(workOrder)
	if err != nil {
		return fmt.Errorf("encode work order payload: %w", err)
	}
	assignedTo := ptrStringValue(workOrder.Assignment.AssignedTo)
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO work_orders(
		   id, order_number, customer_id, location_id, client_name, job_description,
		   issued_by, assigned_to, status, issue_date, due_date, price, payload,
		   created_at, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   order_number = excluded.order_number,
		   customer_id = excluded.customer_id,
		   location_id = excluded.location_id,
		   client_name = excluded.client_name,
		   job_description = excluded.job_description,
		   issued_by = excluded.issued_by,
		   assigned_to = excluded.assigned_to,
		   status = excluded.status,
		   issue_date = excluded.issue_date,
		   due_date = excluded.due_date,
		   price = excluded.price,
		   payload = excluded.payload,
		   created_at = excluded.created_at,
		   updated_at = excluded.updated_at`,
		workOrder.ID,
		workOrder.OrderNumber,
		ptrStringValue(workOrder.CustomerID),
		ptrStringValue(workOrder.LocationID),
		workOrder.ClientName,
		workOrder.JobDescription,
		workOrder.IssuedBy,
		assignedTo,
		string(workOrder.Status),
		workOrder.IssueDate,
		ptrStringValue(workOrder.DueDate),
		ptrFloatValue(workOrder.Price),
		string(payload),
		workOrder.CreatedAt,
		workOrder.UpdatedAt,
	); err != nil {
		return fmt.Errorf("put work order: %w", err)
	}
	return nil
}

func (s *SQLiteStore) CreateUser(
	ctx context.Context,
	id string,
	username string,
	password string,
	role domain.UserRole,
	isDemo bool,
) error {
	if strings.TrimSpace(id) == "" || strings.TrimSpace(username) == "" || strings.TrimSpace(password) == "" {
		return newValidationError(invalidWorkOrderMessage)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO users(id, username, password_hash, role, is_demo, updated_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(username) DO UPDATE SET
		   password_hash = excluded.password_hash,
		   role = excluded.role,
		   is_demo = excluded.is_demo,
		   updated_at = CURRENT_TIMESTAMP`,
		id,
		username,
		string(hash),
		string(role),
		boolInt(isDemo),
	); err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (s *SQLiteStore) HasUserPassword(ctx context.Context, username string, password string) (bool, error) {
	user, err := s.AuthenticateUser(ctx, username, password)
	if err != nil {
		return false, err
	}
	return user != nil, nil
}

func (s *SQLiteStore) Backup(ctx context.Context, path string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("backup path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create backup directory: %w", err)
	}
	escaped := strings.ReplaceAll(path, "'", "''")
	if _, err := s.db.ExecContext(ctx, `VACUUM INTO '`+escaped+`'`); err != nil {
		return fmt.Errorf("backup sqlite database: %w", err)
	}
	return nil
}

func (s *SQLiteStore) nextSequence(ctx context.Context) (int, error) {
	var next sql.NullInt64
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1
		 FROM work_orders
		 WHERE id GLOB '[0-9]*'`,
	).Scan(&next); err != nil {
		return 0, fmt.Errorf("next work-order sequence: %w", err)
	}
	if !next.Valid || next.Int64 < 1 {
		return 1, nil
	}
	return int(next.Int64), nil
}

func buildWorkOrderWhere(query WorkOrderListQuery) (string, []any) {
	clauses := []string{}
	args := []any{}
	if strings.TrimSpace(query.Search) != "" {
		clauses = append(clauses, `(LOWER(order_number || ' ' || client_name || ' ' || job_description) LIKE ?)`)
		args = append(args, "%"+strings.ToLower(strings.TrimSpace(query.Search))+"%")
	}
	if query.Status != "" {
		clauses = append(clauses, `status = ?`)
		args = append(args, string(query.Status))
	}
	if query.AssignedTo != "" {
		clauses = append(clauses, `assigned_to = ?`)
		args = append(args, query.AssignedTo)
	}
	if query.DateFrom != "" {
		clauses = append(clauses, `issue_date >= ?`)
		args = append(args, query.DateFrom)
	}
	if query.DateTo != "" {
		clauses = append(clauses, `issue_date <= ?`)
		args = append(args, query.DateTo)
	}
	if len(clauses) == 0 {
		return "", args
	}
	return "WHERE " + strings.Join(clauses, " AND "), args
}

func workOrderOrderBy(sortKey string) string {
	desc := strings.HasPrefix(sortKey, "-")
	field := strings.TrimPrefix(sortKey, "-")
	column := "issue_date"
	switch field {
	case "orderNumber":
		column = "order_number"
	case "clientName":
		column = "client_name"
	case "status":
		column = "status"
	case "assignedTo":
		column = "assigned_to"
	case "dueDate":
		column = "due_date"
	case "price":
		column = "price"
	case "issueDate", "":
		column = "issue_date"
	}
	direction := "ASC"
	if desc || sortKey == "" {
		direction = "DESC"
	}
	return "ORDER BY " + column + " " + direction + ", id ASC"
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func ptrStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func ptrFloatValue(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
