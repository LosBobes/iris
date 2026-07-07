package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const initialSQLiteMigration = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	version INTEGER PRIMARY KEY,
	applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	username TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
	is_demo INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	contact_name TEXT,
	email TEXT,
	phone TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	address TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_orders (
	id TEXT PRIMARY KEY,
	order_number TEXT NOT NULL UNIQUE,
	customer_id TEXT,
	location_id TEXT,
	client_name TEXT NOT NULL,
	job_description TEXT NOT NULL,
	issued_by TEXT NOT NULL,
	assigned_to TEXT,
	status TEXT NOT NULL,
	issue_date TEXT NOT NULL,
	due_date TEXT,
	price REAL,
	payload TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_issue_date ON work_orders(issue_date);

CREATE TABLE IF NOT EXISTS work_order_status_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	status TEXT NOT NULL,
	changed_at TEXT NOT NULL,
	changed_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_order_notes (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	visibility TEXT NOT NULL CHECK (visibility IN ('internal', 'customer')),
	author TEXT NOT NULL,
	body TEXT NOT NULL,
	created_at TEXT NOT NULL,
	PRIMARY KEY (work_order_id, id, visibility)
);

CREATE TABLE IF NOT EXISTS work_order_events (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,
	label TEXT NOT NULL,
	actor TEXT NOT NULL,
	created_at TEXT NOT NULL,
	PRIMARY KEY (work_order_id, id)
);

CREATE TABLE IF NOT EXISTS work_order_attachments (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	file_name TEXT NOT NULL,
	file_type TEXT NOT NULL,
	url TEXT,
	uploaded_at TEXT NOT NULL,
	PRIMARY KEY (work_order_id, id)
);

CREATE TABLE IF NOT EXISTS work_order_materials (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	unit TEXT NOT NULL,
	unit_cost REAL,
	PRIMARY KEY (work_order_id, id)
);

CREATE TABLE IF NOT EXISTS work_order_time_entries (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	operator TEXT NOT NULL,
	minutes INTEGER NOT NULL,
	logged_at TEXT NOT NULL,
	PRIMARY KEY (work_order_id, id)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	kind TEXT NOT NULL DEFAULT 'service',
	description TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	unit TEXT NOT NULL DEFAULT 'kom',
	unit_price REAL NOT NULL,
	PRIMARY KEY (work_order_id, id)
);
`

// enumValuesMigration adds admin-managed custom values for work-order
// picklists. Built-in defaults stay in code; this table only stores the extra
// values an administrator creates.
const enumValuesMigration = `
CREATE TABLE IF NOT EXISTS enum_values (
	id TEXT PRIMARY KEY,
	field TEXT NOT NULL,
	value TEXT NOT NULL,
	label TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (field, value)
);
`

// catalogItemsMigration adds the admin-managed catalog of articles and services
// that regular users select when building work orders. Imported from the legacy
// MdArt table (code/kind/unit/price/barcode/tax-group/description).
const catalogItemsMigration = `
CREATE TABLE IF NOT EXISTS catalog_items (
	id TEXT PRIMARY KEY,
	code TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('service', 'article')),
	unit TEXT NOT NULL DEFAULT 'kom',
	default_price REAL,
	barcode TEXT,
	tax_group TEXT,
	description TEXT,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_kind ON catalog_items(kind);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name ON catalog_items(name COLLATE NOCASE);
`

// customerIdentifiersMigration adds the Serbian firm identifiers PIB and MB to
// customers. Existing rows keep NULLs; values are validated at the API layer.
const customerIdentifiersMigration = `
ALTER TABLE customers ADD COLUMN pib TEXT;
ALTER TABLE customers ADD COLUMN mb TEXT;
`

// catalogPricesMigration splits the single default_price into a sale price
// (prodajna cena, visible to everyone) and a purchase/cost price (nabavna cena
// for articles, cena rada for services — admin-only). Existing default_price
// values are treated as the sale price. default_price is left in place for
// backward compatibility but no longer read.
const catalogPricesMigration = `
ALTER TABLE catalog_items ADD COLUMN purchase_price REAL;
ALTER TABLE catalog_items ADD COLUMN sale_price REAL;
UPDATE catalog_items SET sale_price = default_price;
`

// appSettingsMigration adds a small key-value table for shop-wide settings
// (currently just the firm/branding name) and seeds the default firm name.
const appSettingsMigration = `
CREATE TABLE IF NOT EXISTS app_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings(key, value) VALUES ('firm_name', 'Grafika Čobanović');
`

// catalogCostHistoryMigration adds an effective-dated cost-history table
// (1-N to catalog_items). The store appends a new record whenever an admin
// changes an item's price, so work orders can snapshot the cost in effect on
// their issue/completion date rather than the latest one. The current price
// columns on catalog_items remain the cached "now" value (= the open record).
// Existing items are backfilled with one open record from their current prices,
// effective from the item's creation date.
const catalogCostHistoryMigration = `
CREATE TABLE IF NOT EXISTS catalog_item_price_history (
	id TEXT PRIMARY KEY,
	catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
	purchase_price REAL,
	sale_price REAL,
	effective_from TEXT NOT NULL,
	effective_to TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_price_history_item
	ON catalog_item_price_history(catalog_item_id, effective_from);

INSERT INTO catalog_item_price_history(id, catalog_item_id, purchase_price, sale_price, effective_from, effective_to, created_at)
SELECT
	'cph-' || id,
	id,
	purchase_price,
	sale_price,
	substr(COALESCE(created_at, CURRENT_TIMESTAMP), 1, 10),
	NULL,
	COALESCE(created_at, CURRENT_TIMESTAMP)
FROM catalog_items;
`

// workOrderCostReviewMigration adds a queryable flag for the admin cost-review
// queue. The authoritative value also lives in the JSON payload; this column is
// kept in sync on write so the list endpoint can filter without scanning JSON.
const workOrderCostReviewMigration = `
ALTER TABLE work_orders ADD COLUMN needs_cost_review INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_work_orders_needs_cost_review ON work_orders(needs_cost_review);
`

// customerContactsMigration adds the 1-N child tables for a firm's corporate
// emails and contact people. The legacy single contact_name/email/phone columns
// on customers are retained for back-compat and backfilled into the new tables
// (one email row, one contact row) so existing records keep their data.
const customerContactsMigration = `
CREATE TABLE IF NOT EXISTS customer_emails (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	label TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_emails_customer ON customer_emails(customer_id);

CREATE TABLE IF NOT EXISTS customer_contacts (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	email TEXT,
	phone TEXT,
	role TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

INSERT INTO customer_emails(id, customer_id, email, sort_order)
SELECT 'cem-' || id, id, email, 0
FROM customers
WHERE email IS NOT NULL AND TRIM(email) <> '';

INSERT INTO customer_contacts(id, customer_id, name, email, phone, sort_order)
SELECT 'cct-' || id, id, contact_name, email, phone, 0
FROM customers
WHERE contact_name IS NOT NULL AND TRIM(contact_name) <> '';
`

// sqliteMigrations is the ordered list of schema versions. Each entry is applied
// once, in order, and recorded in schema_migrations so existing databases pick
// up later versions on the next startup.
//
// Most migrations are a plain SQL string applied inside one transaction. A few
// need finer control (e.g. toggling PRAGMA foreign_keys, which is a no-op inside
// a transaction) and supply an fn instead; the runner calls fn and records the
// version but does not open a transaction for it.
var sqliteMigrations = []struct {
	version int
	sql     string
	fn      func(ctx context.Context, db *sql.DB) error
}{
	{version: 1, sql: initialSQLiteMigration},
	{version: 2, sql: enumValuesMigration},
	{version: 3, sql: catalogItemsMigration},
	{version: 4, sql: customerIdentifiersMigration},
	{version: 5, sql: catalogPricesMigration},
	{version: 6, sql: appSettingsMigration},
	{version: 7, sql: catalogCostHistoryMigration},
	{version: 8, sql: workOrderCostReviewMigration},
	{version: 9, sql: customerContactsMigration},
	{version: 10, fn: tenantIsolationMigration},
}

func RunMigrations(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		return fmt.Errorf("enable foreign keys: %w", err)
	}

	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("ensure schema migrations: %w", err)
	}

	for _, migration := range sqliteMigrations {
		var applied int
		if err := db.QueryRowContext(
			ctx,
			`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`,
			migration.version,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration version %d: %w", migration.version, err)
		}
		if applied > 0 {
			continue
		}
		if migration.fn != nil {
			if err := migration.fn(ctx, db); err != nil {
				return fmt.Errorf("run migration %d: %w", migration.version, err)
			}
			if _, err := db.ExecContext(
				ctx,
				`INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)`,
				migration.version,
			); err != nil {
				return fmt.Errorf("record migration %d: %w", migration.version, err)
			}
			continue
		}
		if err := applyMigration(ctx, db, migration.version, migration.sql); err != nil {
			return err
		}
	}

	return nil
}

func applyMigration(ctx context.Context, db *sql.DB, version int, migrationSQL string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %d: %w", version, err)
	}
	defer tx.Rollback()

	for _, statement := range strings.Split(migrationSQL, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("run migration %d statement: %w", version, err)
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)`,
		version,
	); err != nil {
		return fmt.Errorf("record migration %d: %w", version, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %d: %w", version, err)
	}
	return nil
}

// tenantIsolationMigration introduces multi-tenancy. It creates the tenants
// table, seeds the production tenant (Grafika Čobanović), and rebuilds every
// root table (users, customers, work_orders, catalog_items, enum_values,
// app_settings) with a NOT NULL tenant_id and per-tenant uniqueness. Every
// existing row is attributed to the production tenant so live data keeps working.
//
// Dropping the old table-wide UNIQUE constraints requires the standard SQLite
// table rebuild, which must run with foreign keys disabled (a PRAGMA that is a
// no-op inside a transaction). The store opens SQLite with a single connection,
// so toggling the PRAGMA here is safe.
func tenantIsolationMigration(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		return fmt.Errorf("disable foreign keys: %w", err)
	}
	// Always restore enforcement, even on an error path.
	defer func() { _, _ = db.ExecContext(ctx, `PRAGMA foreign_keys = ON`) }()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	statements := []string{
		`CREATE TABLE tenants (
			id TEXT PRIMARY KEY,
			slug TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`INSERT INTO tenants(id, slug, name) VALUES (
			'` + ProductionTenantID + `', '` + ProductionTenantSlug + `', '` + ProductionTenantName + `'
		)`,

		// users: username was globally UNIQUE -> unique per tenant.
		`CREATE TABLE users_new (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			username TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
			is_demo INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (tenant_id, username)
		)`,
		`INSERT INTO users_new (id, tenant_id, username, password_hash, role, is_demo, created_at, updated_at)
			SELECT id, '` + ProductionTenantID + `', username, password_hash, role, is_demo, created_at, updated_at FROM users`,
		`DROP TABLE users`,
		`ALTER TABLE users_new RENAME TO users`,
		`CREATE INDEX idx_users_tenant ON users(tenant_id)`,

		// customers: no table-wide unique, but rebuilt for a NOT NULL tenant_id.
		`CREATE TABLE customers_new (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			contact_name TEXT,
			email TEXT,
			phone TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			pib TEXT,
			mb TEXT
		)`,
		`INSERT INTO customers_new (id, tenant_id, name, contact_name, email, phone, created_at, updated_at, pib, mb)
			SELECT id, '` + ProductionTenantID + `', name, contact_name, email, phone, created_at, updated_at, pib, mb FROM customers`,
		`DROP TABLE customers`,
		`ALTER TABLE customers_new RENAME TO customers`,
		`CREATE INDEX idx_customers_tenant ON customers(tenant_id)`,

		// work_orders: order_number was globally UNIQUE -> unique per tenant.
		`CREATE TABLE work_orders_new (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			order_number TEXT NOT NULL,
			customer_id TEXT,
			location_id TEXT,
			client_name TEXT NOT NULL,
			job_description TEXT NOT NULL,
			issued_by TEXT NOT NULL,
			assigned_to TEXT,
			status TEXT NOT NULL,
			issue_date TEXT NOT NULL,
			due_date TEXT,
			price REAL,
			payload TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			needs_cost_review INTEGER NOT NULL DEFAULT 0,
			UNIQUE (tenant_id, order_number)
		)`,
		`INSERT INTO work_orders_new (id, tenant_id, order_number, customer_id, location_id, client_name, job_description, issued_by, assigned_to, status, issue_date, due_date, price, payload, created_at, updated_at, needs_cost_review)
			SELECT id, '` + ProductionTenantID + `', order_number, customer_id, location_id, client_name, job_description, issued_by, assigned_to, status, issue_date, due_date, price, payload, created_at, updated_at, needs_cost_review FROM work_orders`,
		`DROP TABLE work_orders`,
		`ALTER TABLE work_orders_new RENAME TO work_orders`,
		`CREATE INDEX idx_work_orders_status ON work_orders(status)`,
		`CREATE INDEX idx_work_orders_assigned_to ON work_orders(assigned_to)`,
		`CREATE INDEX idx_work_orders_issue_date ON work_orders(issue_date)`,
		`CREATE INDEX idx_work_orders_needs_cost_review ON work_orders(needs_cost_review)`,
		`CREATE INDEX idx_work_orders_tenant ON work_orders(tenant_id)`,

		// catalog_items: code was globally UNIQUE -> unique per tenant.
		`CREATE TABLE catalog_items_new (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			code TEXT NOT NULL,
			name TEXT NOT NULL,
			kind TEXT NOT NULL CHECK (kind IN ('service', 'article')),
			unit TEXT NOT NULL DEFAULT 'kom',
			default_price REAL,
			barcode TEXT,
			tax_group TEXT,
			description TEXT,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			purchase_price REAL,
			sale_price REAL,
			UNIQUE (tenant_id, code)
		)`,
		`INSERT INTO catalog_items_new (id, tenant_id, code, name, kind, unit, default_price, barcode, tax_group, description, is_active, created_at, updated_at, purchase_price, sale_price)
			SELECT id, '` + ProductionTenantID + `', code, name, kind, unit, default_price, barcode, tax_group, description, is_active, created_at, updated_at, purchase_price, sale_price FROM catalog_items`,
		`DROP TABLE catalog_items`,
		`ALTER TABLE catalog_items_new RENAME TO catalog_items`,
		`CREATE INDEX idx_catalog_items_kind ON catalog_items(kind)`,
		`CREATE INDEX idx_catalog_items_name ON catalog_items(name COLLATE NOCASE)`,
		`CREATE INDEX idx_catalog_items_tenant ON catalog_items(tenant_id)`,

		// enum_values: UNIQUE(field, value) -> UNIQUE(tenant_id, field, value).
		`CREATE TABLE enum_values_new (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			field TEXT NOT NULL,
			value TEXT NOT NULL,
			label TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (tenant_id, field, value)
		)`,
		`INSERT INTO enum_values_new (id, tenant_id, field, value, label, sort_order, created_at, updated_at)
			SELECT id, '` + ProductionTenantID + `', field, value, label, sort_order, created_at, updated_at FROM enum_values`,
		`DROP TABLE enum_values`,
		`ALTER TABLE enum_values_new RENAME TO enum_values`,

		// app_settings: PRIMARY KEY(key) -> PRIMARY KEY(tenant_id, key).
		`CREATE TABLE app_settings_new (
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			PRIMARY KEY (tenant_id, key)
		)`,
		`INSERT INTO app_settings_new (tenant_id, key, value)
			SELECT '` + ProductionTenantID + `', key, value FROM app_settings`,
		`DROP TABLE app_settings`,
		`ALTER TABLE app_settings_new RENAME TO app_settings`,
	}

	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("rebuild statement: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	// Confirm the rebuild left no dangling foreign keys before re-enabling them.
	rows, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("foreign key check: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		return fmt.Errorf("foreign key check reported violations after tenant migration")
	}
	return rows.Err()
}
