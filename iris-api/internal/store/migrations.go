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

// sqliteMigrations is the ordered list of schema versions. Each entry is applied
// once, in order, and recorded in schema_migrations so existing databases pick
// up later versions on the next startup.
var sqliteMigrations = []struct {
	version int
	sql     string
}{
	{version: 1, sql: initialSQLiteMigration},
	{version: 2, sql: enumValuesMigration},
	{version: 3, sql: catalogItemsMigration},
	{version: 4, sql: customerIdentifiersMigration},
	{version: 5, sql: catalogPricesMigration},
	{version: 6, sql: appSettingsMigration},
	{version: 7, sql: catalogCostHistoryMigration},
	{version: 8, sql: workOrderCostReviewMigration},
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
