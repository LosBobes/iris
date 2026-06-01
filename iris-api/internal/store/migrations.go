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
	description TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	unit_price REAL NOT NULL,
	PRIMARY KEY (work_order_id, id)
);
`

func RunMigrations(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		return fmt.Errorf("enable foreign keys: %w", err)
	}

	var exists int
	if err := db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
	).Scan(&exists); err != nil {
		return fmt.Errorf("check schema migrations: %w", err)
	}

	if exists > 0 {
		var applied int
		if err := db.QueryRowContext(
			ctx,
			`SELECT COUNT(*) FROM schema_migrations WHERE version = 1`,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration version: %w", err)
		}
		if applied > 0 {
			return nil
		}
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration: %w", err)
	}
	defer tx.Rollback()

	for _, statement := range strings.Split(initialSQLiteMigration, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("run migration statement: %w", err)
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)`,
	); err != nil {
		return fmt.Errorf("record migration: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration: %w", err)
	}
	return nil
}
