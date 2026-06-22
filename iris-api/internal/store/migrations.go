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

// sqliteMigrations is the ordered list of schema versions. Each entry is applied
// once, in order, and recorded in schema_migrations so existing databases pick
// up later versions on the next startup.
var sqliteMigrations = []struct {
	version int
	sql     string
}{
	{version: 1, sql: initialSQLiteMigration},
	{version: 2, sql: enumValuesMigration},
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
