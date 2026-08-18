package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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

// AuthenticateUser verifies credentials within a single tenant. The tenant id is
// passed explicitly (not read from context) because authentication happens at
// login, before any tenant is attached to the request context.
func (s *SQLiteStore) AuthenticateUser(
	ctx context.Context,
	tenantID string,
	username string,
	password string,
) (*domain.User, error) {
	var user domain.User
	var passwordHash string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username, role, tenant_id, password_hash FROM users WHERE tenant_id = ? AND username = ?`,
		tenantID,
		username,
	).Scan(&user.ID, &user.Username, &user.Role, &user.TenantID, &passwordHash)
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
		`SELECT users.id, users.username, users.role, users.tenant_id, sessions.expires_at
		 FROM sessions
		 JOIN users ON users.id = sessions.user_id
		 WHERE sessions.token = ?`,
		token,
	).Scan(&user.ID, &user.Username, &user.Role, &user.TenantID, &expiresAtRaw)
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

// TenantBySlug resolves an organization by its login slug (case-insensitive),
// returning nil when no tenant matches. Used at login and by the CLI.
func (s *SQLiteStore) TenantBySlug(ctx context.Context, slug string) (*domain.Tenant, error) {
	var tenant domain.Tenant
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, slug, name FROM tenants WHERE slug = ? COLLATE NOCASE`,
		strings.TrimSpace(slug),
	).Scan(&tenant.ID, &tenant.Slug, &tenant.Name)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load tenant: %w", err)
	}
	return &tenant, nil
}

// CreateTenant provisions a new organization. Slug is normalized to lowercase;
// a duplicate slug is reported as a validation error.
func (s *SQLiteStore) CreateTenant(ctx context.Context, id, slug, name string) (*domain.Tenant, error) {
	id = strings.TrimSpace(id)
	slug = strings.ToLower(strings.TrimSpace(slug))
	name = strings.TrimSpace(name)
	if id == "" || slug == "" || name == "" {
		return nil, newValidationError("Naziv, oznaka i ID organizacije su obavezni.")
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO tenants(id, slug, name) VALUES (?, ?, ?)`,
		id, slug, name,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError("Organizacija sa tom oznakom već postoji.")
		}
		return nil, fmt.Errorf("create tenant: %w", err)
	}
	return &domain.Tenant{ID: id, Slug: slug, Name: name}, nil
}

// EnsureTenant inserts a tenant if it does not already exist, making it safe to
// call from idempotent seed paths.
func (s *SQLiteStore) EnsureTenant(ctx context.Context, id, slug, name string) error {
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO tenants(id, slug, name) VALUES (?, ?, ?)`,
		id, strings.ToLower(strings.TrimSpace(slug)), name,
	); err != nil {
		return fmt.Errorf("ensure tenant: %w", err)
	}
	return nil
}

// WorkOrderByPublicToken looks up a work order by its public tracking token. The
// token is a globally unique random string, so this lookup is deliberately
// cross-tenant (it needs no tenant in context) and backs the public tracking
// endpoint that customers reach without logging in.
func (s *SQLiteStore) WorkOrderByPublicToken(ctx context.Context, token string) (*domain.WorkOrder, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT payload FROM work_orders`)
	if err != nil {
		return nil, fmt.Errorf("scan work orders for public token: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return nil, fmt.Errorf("scan work order: %w", err)
		}
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
			return nil, fmt.Errorf("decode work order payload: %w", err)
		}
		if workOrder.Communication.PublicToken == token {
			workOrder = normalizeStoredWorkOrder(workOrder)
			return &workOrder, nil
		}
	}
	return nil, rows.Err()
}

func (s *SQLiteStore) Customers(ctx context.Context, query CustomerQuery) (CustomerListResult, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return CustomerListResult{}, err
	}
	where := " WHERE tenant_id = ?"
	args := []any{tenantID}
	if search := strings.TrimSpace(query.Search); search != "" {
		where += " AND (name LIKE ? COLLATE NOCASE OR pib LIKE ? OR mb LIKE ?)"
		like := "%" + search + "%"
		args = append(args, like, like, like)
	}

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM customers`+where, args...).Scan(&total); err != nil {
		return CustomerListResult{}, fmt.Errorf("count customers: %w", err)
	}

	sqlText := `SELECT id, name, contact_name, email, phone, pib, mb FROM customers` + where + ` ORDER BY name COLLATE NOCASE`
	if query.Limit > 0 {
		sqlText += " LIMIT ? OFFSET ?"
		args = append(args, query.Limit, maxInt(query.Offset, 0))
	}

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return CustomerListResult{}, fmt.Errorf("list customers: %w", err)
	}
	defer rows.Close()

	customers := make([]domain.Customer, 0)
	for rows.Next() {
		var customer domain.Customer
		var contactName, email, phone, pib, mb sql.NullString
		if err := rows.Scan(&customer.ID, &customer.Name, &contactName, &email, &phone, &pib, &mb); err != nil {
			return CustomerListResult{}, fmt.Errorf("scan customer: %w", err)
		}
		customer.ContactName = nullStringPtr(contactName)
		customer.Email = nullStringPtr(email)
		customer.Phone = nullStringPtr(phone)
		customer.Pib = nullStringPtr(pib)
		customer.Mb = nullStringPtr(mb)
		customers = append(customers, customer)
	}
	if err := rows.Err(); err != nil {
		return CustomerListResult{}, err
	}
	if err := s.loadCustomerChildren(ctx, customers); err != nil {
		return CustomerListResult{}, err
	}
	return CustomerListResult{Items: customers, Total: total}, nil
}

// loadCustomerChildren populates the Emails and Contacts collections for the
// given customers in two batched queries (avoiding N+1). The slices are always
// initialized to non-nil so they serialize as [] rather than null.
func (s *SQLiteStore) loadCustomerChildren(ctx context.Context, customers []domain.Customer) error {
	indexByID := make(map[string]int, len(customers))
	for i := range customers {
		customers[i].Emails = []domain.CustomerEmail{}
		customers[i].Contacts = []domain.CustomerContact{}
		indexByID[customers[i].ID] = i
	}
	if len(customers) == 0 {
		return nil
	}

	args := make([]any, len(customers))
	placeholders := make([]string, len(customers))
	for i := range customers {
		args[i] = customers[i].ID
		placeholders[i] = "?"
	}
	in := strings.Join(placeholders, ",")

	emailRows, err := s.db.QueryContext(
		ctx,
		`SELECT id, customer_id, email, label, sort_order FROM customer_emails
		 WHERE customer_id IN (`+in+`) ORDER BY sort_order, email COLLATE NOCASE`,
		args...,
	)
	if err != nil {
		return fmt.Errorf("load customer emails: %w", err)
	}
	defer emailRows.Close()
	for emailRows.Next() {
		var email domain.CustomerEmail
		var customerID string
		var label sql.NullString
		if err := emailRows.Scan(&email.ID, &customerID, &email.Email, &label, &email.SortOrder); err != nil {
			return fmt.Errorf("scan customer email: %w", err)
		}
		email.Label = nullStringPtr(label)
		if i, ok := indexByID[customerID]; ok {
			customers[i].Emails = append(customers[i].Emails, email)
		}
	}
	if err := emailRows.Err(); err != nil {
		return err
	}

	contactRows, err := s.db.QueryContext(
		ctx,
		`SELECT id, customer_id, name, email, phone, role, sort_order FROM customer_contacts
		 WHERE customer_id IN (`+in+`) ORDER BY sort_order, name COLLATE NOCASE`,
		args...,
	)
	if err != nil {
		return fmt.Errorf("load customer contacts: %w", err)
	}
	defer contactRows.Close()
	for contactRows.Next() {
		var contact domain.CustomerContact
		var customerID string
		var email, phone, role sql.NullString
		if err := contactRows.Scan(
			&contact.ID, &customerID, &contact.Name, &email, &phone, &role, &contact.SortOrder,
		); err != nil {
			return fmt.Errorf("scan customer contact: %w", err)
		}
		contact.Email = nullStringPtr(email)
		contact.Phone = nullStringPtr(phone)
		contact.Role = nullStringPtr(role)
		if i, ok := indexByID[customerID]; ok {
			customers[i].Contacts = append(customers[i].Contacts, contact)
		}
	}
	return contactRows.Err()
}

func (s *SQLiteStore) CustomerByID(ctx context.Context, id string) (*domain.Customer, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	var customer domain.Customer
	var contactName, email, phone, pib, mb sql.NullString
	err = s.db.QueryRowContext(
		ctx,
		`SELECT id, name, contact_name, email, phone, pib, mb FROM customers WHERE id = ? AND tenant_id = ?`,
		id,
		tenantID,
	).Scan(&customer.ID, &customer.Name, &contactName, &email, &phone, &pib, &mb)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load customer: %w", err)
	}
	customer.ContactName = nullStringPtr(contactName)
	customer.Email = nullStringPtr(email)
	customer.Phone = nullStringPtr(phone)
	customer.Pib = nullStringPtr(pib)
	customer.Mb = nullStringPtr(mb)
	loaded := []domain.Customer{customer}
	if err := s.loadCustomerChildren(ctx, loaded); err != nil {
		return nil, err
	}
	return &loaded[0], nil
}

func (s *SQLiteStore) Locations(ctx context.Context, customerID string) ([]domain.Location, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	// locations has no tenant_id of its own; it is scoped through its parent
	// customer, which does. An optional customerID narrows the result to a
	// single firm so the work-order form can lazy-load only what it needs.
	query := `SELECT locations.id, locations.customer_id, locations.name, locations.address
		 FROM locations
		 JOIN customers ON customers.id = locations.customer_id
		 WHERE customers.tenant_id = ?`
	args := []any{tenantID}
	if customerID != "" {
		query += ` AND locations.customer_id = ?`
		args = append(args, customerID)
	}
	query += ` ORDER BY locations.name COLLATE NOCASE`
	rows, err := s.db.QueryContext(ctx, query, args...)
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
	if msg := domain.ValidateCustomerIdentifiers(customer.Pib, customer.Mb); msg != "" {
		return nil, newValidationError(msg)
	}
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin upsert customer: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := ensureRowTenant(ctx, tx, "customers", customer.ID, tenantID); err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO customers(id, tenant_id, name, contact_name, email, phone, pib, mb, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   name = excluded.name,
		   contact_name = excluded.contact_name,
		   email = excluded.email,
		   phone = excluded.phone,
		   pib = excluded.pib,
		   mb = excluded.mb,
		   updated_at = CURRENT_TIMESTAMP`,
		customer.ID,
		tenantID,
		customer.Name,
		ptrStringValue(customer.ContactName),
		ptrStringValue(customer.Email),
		ptrStringValue(customer.Phone),
		ptrStringValue(customer.Pib),
		ptrStringValue(customer.Mb),
	); err != nil {
		return nil, fmt.Errorf("upsert customer: %w", err)
	}

	// Child collections are replaced wholesale: the request payload is the
	// authoritative set, so removed rows disappear and reordering sticks.
	if _, err := tx.ExecContext(ctx, `DELETE FROM customer_emails WHERE customer_id = ?`, customer.ID); err != nil {
		return nil, fmt.Errorf("clear customer emails: %w", err)
	}
	stored := customer
	stored.Emails = make([]domain.CustomerEmail, 0, len(customer.Emails))
	for i, email := range customer.Emails {
		if strings.TrimSpace(email.Email) == "" {
			continue
		}
		if strings.TrimSpace(email.ID) == "" {
			id, idErr := newChildID("cem")
			if idErr != nil {
				return nil, idErr
			}
			email.ID = id
		}
		email.SortOrder = i
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO customer_emails(id, customer_id, email, label, sort_order)
			 VALUES (?, ?, ?, ?, ?)`,
			email.ID, customer.ID, strings.TrimSpace(email.Email), ptrStringValue(email.Label), email.SortOrder,
		); err != nil {
			return nil, fmt.Errorf("insert customer email: %w", err)
		}
		stored.Emails = append(stored.Emails, email)
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM customer_contacts WHERE customer_id = ?`, customer.ID); err != nil {
		return nil, fmt.Errorf("clear customer contacts: %w", err)
	}
	stored.Contacts = make([]domain.CustomerContact, 0, len(customer.Contacts))
	for i, contact := range customer.Contacts {
		if strings.TrimSpace(contact.Name) == "" {
			continue
		}
		if strings.TrimSpace(contact.ID) == "" {
			id, idErr := newChildID("cct")
			if idErr != nil {
				return nil, idErr
			}
			contact.ID = id
		}
		contact.SortOrder = i
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO customer_contacts(id, customer_id, name, email, phone, role, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			contact.ID, customer.ID, strings.TrimSpace(contact.Name),
			ptrStringValue(contact.Email), ptrStringValue(contact.Phone), ptrStringValue(contact.Role), contact.SortOrder,
		); err != nil {
			return nil, fmt.Errorf("insert customer contact: %w", err)
		}
		stored.Contacts = append(stored.Contacts, contact)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit upsert customer: %w", err)
	}
	return &stored, nil
}

// ensureRowTenant guards cross-tenant writes on tables that have a global primary
// key but a client-supplied id: if a row with this id already exists under a
// different tenant, the write is rejected instead of silently overwriting or
// deleting another tenant's data. table is always an in-code constant, never
// user input.
func ensureRowTenant(ctx context.Context, db sqlExecutor, table, id, tenantID string) error {
	var existing string
	err := db.QueryRowContext(ctx, `SELECT tenant_id FROM `+table+` WHERE id = ?`, id).Scan(&existing)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("check %s tenant: %w", table, err)
	}
	if existing != tenantID {
		return newValidationError("Zapis pripada drugoj organizaciji.")
	}
	return nil
}

// newChildID returns a short random identifier with the given prefix, used for
// customer child rows (emails, contacts) when the client omits one.
func newChildID(prefix string) (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create %s id: %w", prefix, err)
	}
	return prefix + "-" + hex.EncodeToString(raw[:]), nil
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
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	// The parent customer must belong to this tenant; and if the location already
	// exists it must currently belong to this tenant too. locations has no
	// tenant_id of its own, so both checks go through the customer.
	var parentTenant string
	err = s.db.QueryRowContext(ctx, `SELECT tenant_id FROM customers WHERE id = ?`, location.CustomerID).Scan(&parentTenant)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && parentTenant != tenantID) {
		return nil, newValidationError("Klijent ne pripada vašoj organizaciji.")
	}
	if err != nil {
		return nil, fmt.Errorf("check location customer tenant: %w", err)
	}
	var existingTenant string
	err = s.db.QueryRowContext(
		ctx,
		`SELECT customers.tenant_id FROM locations
		 JOIN customers ON customers.id = locations.customer_id
		 WHERE locations.id = ?`,
		location.ID,
	).Scan(&existingTenant)
	if err == nil && existingTenant != tenantID {
		return nil, newValidationError("Zapis pripada drugoj organizaciji.")
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check existing location tenant: %w", err)
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
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM customers WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return fmt.Errorf("delete customer: %w", err)
	}
	return nil
}

func (s *SQLiteStore) DeleteLocation(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM locations
		 WHERE id = ? AND customer_id IN (SELECT id FROM customers WHERE tenant_id = ?)`,
		id, tenantID,
	); err != nil {
		return fmt.Errorf("delete location: %w", err)
	}
	return nil
}

func (s *SQLiteStore) WorkOrders(
	ctx context.Context,
	query WorkOrderListQuery,
) (WorkOrderListResult, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return WorkOrderListResult{}, err
	}
	where, args := buildWorkOrderWhere(tenantID, query)
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
		workOrder = normalizeStoredWorkOrder(workOrder)
		items = append(items, workOrder)
	}
	if err := rows.Err(); err != nil {
		return WorkOrderListResult{}, err
	}

	return WorkOrderListResult{Items: items, Total: total}, nil
}

func (s *SQLiteStore) WorkOrderByID(ctx context.Context, id string) (*domain.WorkOrder, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	var payload string
	err = s.db.QueryRowContext(
		ctx,
		`SELECT payload FROM work_orders WHERE id = ? AND tenant_id = ?`,
		id,
		tenantID,
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
	workOrder = normalizeStoredWorkOrder(workOrder)
	return &workOrder, nil
}

func normalizeStoredWorkOrder(workOrder domain.WorkOrder) domain.WorkOrder {
	// Work orders are persisted as a JSON payload. A nil slice marshals to
	// `null`, which violates the OpenAPI contract (these are required arrays)
	// and crashes clients that read `.length` without a nil guard. Legacy
	// payloads — e.g. orders created before a collection existed or with the
	// field omitted — can store `null`, so the read path must coerce every
	// collection back to a non-nil empty slice before returning.
	workOrder.StatusHistory = nilToEmpty(workOrder.StatusHistory)
	workOrder.InternalNotes = nilToEmpty(workOrder.InternalNotes)
	workOrder.CustomerNotes = nilToEmpty(workOrder.CustomerNotes)
	workOrder.Events = nilToEmpty(workOrder.Events)
	workOrder.Attachments = nilToEmpty(workOrder.Attachments)
	workOrder.MaterialUsage = normalizeMaterialUsage(workOrder.MaterialUsage)
	workOrder.TimeEntries = nilToEmpty(workOrder.TimeEntries)
	workOrder.InvoiceDraft = normalizeInvoiceDraft(
		workOrder.InvoiceDraft,
		workOrder.JobDescription,
		workOrder.Price,
	)
	return workOrder
}

// nilToEmpty returns a non-nil empty slice in place of a nil one so the JSON
// encoding emits `[]` rather than `null`. Existing non-nil slices pass through
// unchanged.
func nilToEmpty[T any](slice []T) []T {
	if slice == nil {
		return []T{}
	}
	return slice
}

func (s *SQLiteStore) CreateWorkOrder(
	ctx context.Context,
	input domain.CreateWorkOrderInput,
) (*domain.WorkOrder, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	custom, err := s.customEnums(ctx)
	if err != nil {
		return nil, err
	}
	if err := validateCreateWorkOrderInput(input, custom); err != nil {
		return nil, err
	}

	// Look up catalog cost prices before opening the write transaction: the
	// SQLite pool is single-connection, so querying inside the open tx would
	// deadlock waiting for the connection the tx already holds.
	draft := normalizeInvoiceDraft(input.InvoiceDraft, input.JobDescription, input.Price)
	costs, err := s.catalogCostsAsOf(ctx, catalogItemIDs(draft.LineItems), input.IssueDate)
	if err != nil {
		return nil, err
	}

	// The sequence read and the insert must share one transaction: otherwise
	// two concurrent creates can compute the same sequence and the second
	// upsert silently overwrites the first work order.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create work order: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	sequence, err := nextSequence(ctx, tx)
	if err != nil {
		return nil, err
	}
	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339)
	orderNumber, err := resolveOrderNumber(ctx, tx, tenantID, nowTime.Year(), now, input.OrderNumber)
	if err != nil {
		return nil, err
	}
	workOrder := domain.WorkOrder{
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
		InvoiceDraft:  draft,
		Communication: normalizeCommunication(input.Communication, sequence, nil),
	}

	workOrder.InvoiceDraft.LineItems, workOrder.Profit, workOrder.NeedsCostReview = applyLineItemCosts(
		workOrder.InvoiceDraft.LineItems, costs, nil, costModeCreate,
	)
	if workOrder.NeedsCostReview {
		workOrder.Events = applyCostReviewEvents(workOrder.Events, false, true, input.IssuedBy, now)
	}

	if err := putWorkOrder(ctx, tx, tenantID, workOrder); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create work order: %w", err)
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
	custom, err := s.customEnums(ctx)
	if err != nil {
		return nil, err
	}
	updated, err := applyWorkOrderChanges(*current, changes, custom)
	if err != nil {
		return nil, err
	}
	updated.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	// Pick the cost-capture mode: freeze on completion (re-snapshot from the
	// completion-date cost, the final authoritative value), otherwise preserve
	// already-frozen costs and only cost genuinely new catalog lines.
	mode := costModePreserve
	costDate := updated.IssueDate
	if !current.IsCompleted && updated.IsCompleted {
		mode = costModeCompletion
		if updated.CompletionDate != nil {
			costDate = *updated.CompletionDate
		} else {
			costDate = time.Now().UTC().Format("2006-01-02")
		}
	}
	costs, err := s.catalogCostsAsOf(ctx, catalogItemIDs(updated.InvoiceDraft.LineItems), costDate)
	if err != nil {
		return nil, err
	}
	wasNeeded := current.NeedsCostReview
	updated.InvoiceDraft.LineItems, updated.Profit, updated.NeedsCostReview = applyLineItemCosts(
		updated.InvoiceDraft.LineItems, costs, current.InvoiceDraft.LineItems, mode,
	)
	actor := updated.IssuedBy
	if updated.ExecutedBy != nil && *updated.ExecutedBy != "" {
		actor = *updated.ExecutedBy
	}
	updated.Events = applyCostReviewEvents(updated.Events, wasNeeded, updated.NeedsCostReview, actor, updated.UpdatedAt)

	if err := s.PutWorkOrder(ctx, updated); err != nil {
		return nil, err
	}
	return cloneWorkOrder(updated), nil
}

func (s *SQLiteStore) DeleteWorkOrder(
	ctx context.Context,
	id string,
) (domain.DeleteWorkOrderResponse, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.DeleteWorkOrderResponse{}, err
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM work_orders WHERE id = ? AND tenant_id = ?`, id, tenantID)
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

// Operators returns the usernames of all registered users (operators and
// admins), sorted. This is the assignable-user list backing the work-order
// operator selects; admins are included so they can be assigned work too.
func (s *SQLiteStore) Operators(ctx context.Context) ([]string, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT username FROM users WHERE tenant_id = ? AND role IN (?, ?) ORDER BY username COLLATE NOCASE`,
		tenantID,
		string(domain.RoleUser),
		string(domain.RoleAdmin),
	)
	if err != nil {
		return nil, fmt.Errorf("list operators: %w", err)
	}
	defer rows.Close()

	operators := make([]string, 0)
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err != nil {
			return nil, fmt.Errorf("scan operator: %w", err)
		}
		operators = append(operators, username)
	}
	return operators, rows.Err()
}

// sqlExecutor abstracts *sql.DB and *sql.Tx so write helpers can run either
// standalone or inside a transaction.
type sqlExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func (s *SQLiteStore) PutWorkOrder(ctx context.Context, workOrder domain.WorkOrder) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	return putWorkOrder(ctx, s.db, tenantID, workOrder)
}

func putWorkOrder(ctx context.Context, db sqlExecutor, tenantID string, workOrder domain.WorkOrder) error {
	payload, err := json.Marshal(workOrder)
	if err != nil {
		return fmt.Errorf("encode work order payload: %w", err)
	}
	assignedTo := ptrStringValue(workOrder.Assignment.AssignedTo)
	if _, err := db.ExecContext(
		ctx,
		`INSERT INTO work_orders(
		   id, tenant_id, order_number, customer_id, location_id, client_name, job_description,
		   issued_by, assigned_to, status, issue_date, due_date, price, needs_cost_review,
		   payload, created_at, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		   needs_cost_review = excluded.needs_cost_review,
		   payload = excluded.payload,
		   created_at = excluded.created_at,
		   updated_at = excluded.updated_at
		 WHERE work_orders.tenant_id = excluded.tenant_id`,
		workOrder.ID,
		tenantID,
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
		boolInt(workOrder.NeedsCostReview),
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
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO users(id, tenant_id, username, password_hash, role, is_demo, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(tenant_id, username) DO UPDATE SET
		   password_hash = excluded.password_hash,
		   role = excluded.role,
		   is_demo = excluded.is_demo,
		   updated_at = CURRENT_TIMESTAMP`,
		id,
		tenantID,
		username,
		string(hash),
		string(role),
		boolInt(isDemo),
	); err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// HasUserPassword reports whether any user in any tenant has the given username
// and password. It is a cross-tenant safety check (used to block production
// startup with demo credentials), not a data-access path, so it intentionally
// scans every tenant rather than requiring one in context.
func (s *SQLiteStore) HasUserPassword(ctx context.Context, username string, password string) (bool, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT password_hash FROM users WHERE username = ?`,
		username,
	)
	if err != nil {
		return false, fmt.Errorf("load user hashes: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var hash string
		if err := rows.Scan(&hash); err != nil {
			return false, fmt.Errorf("scan user hash: %w", err)
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil {
			return true, nil
		}
	}
	return false, rows.Err()
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

func nextSequence(ctx context.Context, db sqlExecutor) (int, error) {
	var next sql.NullInt64
	if err := db.QueryRowContext(
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

// nextOrderNumber returns the next free RN-<year>-<seq> order number for the year.
// It takes the highest sequence across both committed work orders and still-active
// (unexpired) reservations, so a number handed out to another operator's open
// create form is never allocated twice. It reads order numbers directly rather
// than deriving from the id sequence, so it stays correct even when work-order ids
// are non-numeric (e.g. seeded "wo-cob-1"). Must run inside the same write
// transaction as the insert so concurrent creates/reservations can't collide.
//
// now must be an RFC3339 UTC timestamp; expired reservations are ignored so their
// numbers are reclaimed and abandoned forms only ever leave a gap.
func nextOrderNumber(ctx context.Context, db sqlExecutor, tenantID string, year int, now string) (string, error) {
	prefix := fmt.Sprintf("RN-%d-", year)
	var next sql.NullInt64
	if err := db.QueryRowContext(
		ctx,
		`SELECT COALESCE(MAX(seq), 0) + 1 FROM (
		   SELECT CAST(substr(order_number, ?) AS INTEGER) AS seq
		     FROM work_orders
		     WHERE tenant_id = ? AND order_number LIKE ?
		   UNION ALL
		   SELECT sequence AS seq
		     FROM work_order_number_reservations
		     WHERE tenant_id = ? AND year = ? AND expires_at > ?
		 )`,
		len(prefix)+1, // substr is 1-indexed: start just past the "RN-<year>-" prefix
		tenantID,
		prefix+"%",
		tenantID,
		year,
		now,
	).Scan(&next); err != nil {
		return "", fmt.Errorf("next order number: %w", err)
	}
	seq := 1
	if next.Valid && next.Int64 > 1 {
		seq = int(next.Int64)
	}
	return formatOrderNumber(year, seq), nil
}

// reservationTTL bounds how long a reserved order number is counted as active.
// It comfortably exceeds a normal form-fill session (matching the auth cookie
// lifetime) so an operator's header number survives until they save; a genuinely
// abandoned form is reclaimed after it lapses. The number is still honored at
// save time even if the reservation has just expired, as long as no other order
// has claimed it in the meantime.
const reservationTTL = 12 * time.Hour

// ReserveOrderNumber atomically claims the next order number and records it in the
// reservation ledger so concurrent operators each see a distinct number in their
// create-form header before any work order is saved.
func (s *SQLiteStore) ReserveOrderNumber(ctx context.Context, reservedBy string) (domain.ReservedOrderNumber, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.ReservedOrderNumber{}, err
	}
	reservedBy = strings.TrimSpace(reservedBy)
	if reservedBy == "" {
		return domain.ReservedOrderNumber{}, newValidationError(invalidWorkOrderMessage)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.ReservedOrderNumber{}, fmt.Errorf("begin reserve order number: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339)
	year := nowTime.Year()

	// Prune lapsed reservations so their numbers are reclaimed before allocating.
	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM work_order_number_reservations WHERE tenant_id = ? AND expires_at <= ?`,
		tenantID, now,
	); err != nil {
		return domain.ReservedOrderNumber{}, fmt.Errorf("prune reservations: %w", err)
	}

	orderNumber, err := nextOrderNumber(ctx, tx, tenantID, year, now)
	if err != nil {
		return domain.ReservedOrderNumber{}, err
	}
	sequence, _ := orderNumberSequence(orderNumber, year)
	expiresAt := nowTime.Add(reservationTTL).Format(time.RFC3339)
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO work_order_number_reservations(
		   tenant_id, order_number, year, sequence, reserved_by, reserved_at, expires_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		tenantID, orderNumber, year, sequence, reservedBy, now, expiresAt,
	); err != nil {
		return domain.ReservedOrderNumber{}, fmt.Errorf("insert reservation: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.ReservedOrderNumber{}, fmt.Errorf("commit reserve order number: %w", err)
	}
	return domain.ReservedOrderNumber{OrderNumber: orderNumber, ExpiresAt: expiresAt}, nil
}

// ReleaseOrderNumber drops a still-active reservation so its number is reclaimed
// immediately when an operator cancels the create form. It is scoped to the
// tenant and is a no-op when the number was never reserved or has already been
// consumed by a committed work order.
func (s *SQLiteStore) ReleaseOrderNumber(ctx context.Context, orderNumber string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	orderNumber = strings.TrimSpace(orderNumber)
	if orderNumber == "" {
		return nil
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM work_order_number_reservations WHERE tenant_id = ? AND order_number = ?`,
		tenantID, orderNumber,
	); err != nil {
		return fmt.Errorf("release order number: %w", err)
	}
	return nil
}

// editLockTTL bounds how long an edit lock survives without a heartbeat. It
// comfortably exceeds the client's heartbeat interval so a normal active editor
// keeps the lock refreshed, while a closed tab (no more heartbeats) releases the
// work order shortly after.
const editLockTTL = 2 * time.Minute

// AcquireEditLock claims or refreshes the exclusive edit lock on a work order. It
// runs in a single write transaction so concurrent openers can't both win: expired
// locks are pruned first, then the lock is taken if free or already held by the
// caller (extending its expiry), otherwise the current holder's lock is returned
// with acquired=false so the caller renders a read-only view.
func (s *SQLiteStore) AcquireEditLock(ctx context.Context, workOrderID, lockedBy string) (domain.EditLock, bool, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.EditLock{}, false, err
	}
	workOrderID = strings.TrimSpace(workOrderID)
	lockedBy = strings.TrimSpace(lockedBy)
	if workOrderID == "" || lockedBy == "" {
		return domain.EditLock{}, false, newValidationError(invalidWorkOrderMessage)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.EditLock{}, false, fmt.Errorf("begin acquire edit lock: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339)

	// Prune lapsed locks so an abandoned tab never blocks a work order.
	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM work_order_edit_locks WHERE tenant_id = ? AND expires_at <= ?`,
		tenantID, now,
	); err != nil {
		return domain.EditLock{}, false, fmt.Errorf("prune edit locks: %w", err)
	}

	var holder string
	var lockedAt string
	err = tx.QueryRowContext(
		ctx,
		`SELECT locked_by, locked_at FROM work_order_edit_locks
		   WHERE tenant_id = ? AND work_order_id = ?`,
		tenantID, workOrderID,
	).Scan(&holder, &lockedAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return domain.EditLock{}, false, fmt.Errorf("read edit lock: %w", err)
	}
	if err == nil && holder != lockedBy {
		// Someone else holds an unexpired lock: report them, don't take it.
		return domain.EditLock{
			WorkOrderID: workOrderID,
			LockedBy:    holder,
			LockedAt:    lockedAt,
			ExpiresAt:   "", // expiry is internal; the holder identity is what the caller needs
		}, false, tx.Commit()
	}

	expiresAt := nowTime.Add(editLockTTL).Format(time.RFC3339)
	if errors.Is(err, sql.ErrNoRows) {
		lockedAt = now
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO work_order_edit_locks(tenant_id, work_order_id, locked_by, locked_at, expires_at)
		   VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(tenant_id, work_order_id) DO UPDATE SET
		   locked_by = excluded.locked_by,
		   expires_at = excluded.expires_at`,
		tenantID, workOrderID, lockedBy, lockedAt, expiresAt,
	); err != nil {
		return domain.EditLock{}, false, fmt.Errorf("upsert edit lock: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.EditLock{}, false, fmt.Errorf("commit acquire edit lock: %w", err)
	}
	return domain.EditLock{
		WorkOrderID: workOrderID,
		LockedBy:    lockedBy,
		LockedAt:    lockedAt,
		ExpiresAt:   expiresAt,
	}, true, nil
}

// ReleaseEditLock frees the caller's edit lock. The lockedBy predicate ensures a
// stale client can't delete a lock that a new holder has since acquired.
func (s *SQLiteStore) ReleaseEditLock(ctx context.Context, workOrderID, lockedBy string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	workOrderID = strings.TrimSpace(workOrderID)
	lockedBy = strings.TrimSpace(lockedBy)
	if workOrderID == "" || lockedBy == "" {
		return nil
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM work_order_edit_locks
		   WHERE tenant_id = ? AND work_order_id = ? AND locked_by = ?`,
		tenantID, workOrderID, lockedBy,
	); err != nil {
		return fmt.Errorf("release edit lock: %w", err)
	}
	return nil
}

// resolveOrderNumber decides the final order number for a create. A requested
// number (previously reserved and shown in the form header) is honored when its
// reservation still exists and no committed order has claimed it since; the
// reservation row is then consumed. Otherwise a fresh number is allocated.
func resolveOrderNumber(
	ctx context.Context,
	db sqlExecutor,
	tenantID string,
	year int,
	now string,
	requested *string,
) (string, error) {
	if requested != nil {
		candidate := strings.TrimSpace(*requested)
		if candidate != "" {
			honored, err := reservationHonored(ctx, db, tenantID, candidate)
			if err != nil {
				return "", err
			}
			if honored {
				if _, err := db.ExecContext(
					ctx,
					`DELETE FROM work_order_number_reservations WHERE tenant_id = ? AND order_number = ?`,
					tenantID, candidate,
				); err != nil {
					return "", fmt.Errorf("consume reservation: %w", err)
				}
				return candidate, nil
			}
		}
	}
	return nextOrderNumber(ctx, db, tenantID, year, now)
}

// reservationHonored reports whether a reserved order number can still be used:
// it must have a reservation row for this tenant and must not already be taken by
// a committed work order (which happens if a lapsed reservation was reclaimed).
func reservationHonored(ctx context.Context, db sqlExecutor, tenantID, orderNumber string) (bool, error) {
	var reserved int
	if err := db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM work_order_number_reservations WHERE tenant_id = ? AND order_number = ?`,
		tenantID, orderNumber,
	).Scan(&reserved); err != nil {
		return false, fmt.Errorf("check reservation: %w", err)
	}
	if reserved == 0 {
		return false, nil
	}
	var taken int
	if err := db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM work_orders WHERE tenant_id = ? AND order_number = ?`,
		tenantID, orderNumber,
	).Scan(&taken); err != nil {
		return false, fmt.Errorf("check order number taken: %w", err)
	}
	return taken == 0, nil
}

func buildWorkOrderWhere(tenantID string, query WorkOrderListQuery) (string, []any) {
	clauses := []string{"tenant_id = ?"}
	args := []any{tenantID}
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
	if query.NeedsCostReview {
		clauses = append(clauses, `needs_cost_review = 1`)
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
