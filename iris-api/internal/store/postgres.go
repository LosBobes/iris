package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// postgresSchemaVersion is the SQLite migration version that postgresSchema is
// equivalent to. A Postgres database is created directly at this version rather
// than replaying migrations 1..12: several of those are SQLite table rebuilds
// driven by PRAGMA foreign_keys, which has no Postgres counterpart and no
// purpose on a database that starts out with the final shape.
//
// Migrations numbered above this constant are shared: they run on both engines,
// translated by translateToPostgres. When you add migration 13, you add it to
// sqliteMigrations only — do NOT fold it into postgresSchema, or existing
// Postgres databases will never apply it.
const postgresSchemaVersion = 12

// postgresSchema is the consolidated v12 schema, derived from the schema an
// actual migrated SQLite database reports. Differences from the SQLite original,
// and why:
//
//   - Money columns are NUMERIC(14,4) rather than REAL. Storing prices in binary
//     floating point is a correctness bug (0.1 + 0.2 problems on invoice totals);
//     NUMERIC scans into the same Go float64 targets, so no store code changes.
//   - Boolean-ish flags stay 0/1 smallints with a CHECK, because the store
//     compares them as integers (`is_active = 1`) and scans them into ints.
//   - Timestamps stay TEXT. The store compares them as lexicographically sorted
//     RFC3339/`YYYY-MM-DD HH:MM:SS` strings; converting to timestamptz is a
//     separate change with its own migration, not something to smuggle into a
//     storage-engine port. CURRENT_TIMESTAMP defaults are spelled out so they
//     produce the exact same text SQLite produced.
//   - AUTOINCREMENT becomes an identity column.
//   - The "nocase" collation backs every COLLATE NOCASE the translator emits.
//     ICU level-2 comparison is case-insensitive and accent-sensitive, matching
//     how the store used COLLATE NOCASE (it folds case; the Serbian diacritic
//     folding is done separately, in foldDiacriticsSQL).
const postgresSchema = `
CREATE COLLATION IF NOT EXISTS nocase (
	provider = icu,
	locale = 'und-u-ks-level2',
	deterministic = false
);

CREATE TABLE IF NOT EXISTS schema_migrations (
	version INTEGER PRIMARY KEY,
	applied_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS tenants (
	id TEXT PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	username TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
	is_demo SMALLINT NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	UNIQUE (tenant_id, username)
);

CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS customers (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	contact_name TEXT,
	email TEXT,
	phone TEXT,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	pib TEXT,
	mb TEXT
);

CREATE TABLE IF NOT EXISTS locations (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	address TEXT,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS customer_emails (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	label TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS customer_contacts (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	email TEXT,
	phone TEXT,
	role TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS work_orders (
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
	price NUMERIC(14, 4),
	payload TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	needs_cost_review SMALLINT NOT NULL DEFAULT 0 CHECK (needs_cost_review IN (0, 1)),
	UNIQUE (tenant_id, order_number)
);

CREATE TABLE IF NOT EXISTS work_order_status_history (
	id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	status TEXT NOT NULL,
	changed_at TEXT NOT NULL,
	changed_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_order_materials (
	id TEXT NOT NULL,
	work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	unit TEXT NOT NULL,
	unit_cost NUMERIC(14, 4),
	PRIMARY KEY (work_order_id, id)
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
	unit_price NUMERIC(14, 4) NOT NULL,
	PRIMARY KEY (work_order_id, id)
);

CREATE TABLE IF NOT EXISTS work_order_number_reservations (
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	order_number TEXT NOT NULL,
	year INTEGER NOT NULL,
	sequence INTEGER NOT NULL,
	reserved_by TEXT NOT NULL,
	reserved_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	PRIMARY KEY (tenant_id, order_number)
);

CREATE TABLE IF NOT EXISTS work_order_edit_locks (
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	work_order_id TEXT NOT NULL,
	locked_by TEXT NOT NULL,
	locked_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	PRIMARY KEY (tenant_id, work_order_id)
);

CREATE TABLE IF NOT EXISTS enum_values (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	field TEXT NOT NULL,
	value TEXT NOT NULL,
	label TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	UNIQUE (tenant_id, field, value)
);

CREATE TABLE IF NOT EXISTS catalog_items (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	code TEXT NOT NULL,
	name TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('service', 'article')),
	unit TEXT NOT NULL DEFAULT 'kom',
	default_price NUMERIC(14, 4),
	barcode TEXT,
	tax_group TEXT,
	description TEXT,
	is_active SMALLINT NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
	purchase_price NUMERIC(14, 4),
	sale_price NUMERIC(14, 4),
	UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS catalog_item_price_history (
	id TEXT PRIMARY KEY,
	catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
	purchase_price NUMERIC(14, 4),
	sale_price NUMERIC(14, 4),
	effective_from TEXT NOT NULL,
	effective_to TEXT,
	created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS app_settings (
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	key TEXT NOT NULL,
	value TEXT NOT NULL,
	PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_emails_customer ON customer_emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_issue_date ON work_orders(issue_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_needs_cost_review ON work_orders(needs_cost_review);
CREATE INDEX IF NOT EXISTS idx_wo_number_reservations_active
	ON work_order_number_reservations(tenant_id, year, expires_at);
CREATE INDEX IF NOT EXISTS idx_wo_edit_locks_active
	ON work_order_edit_locks(tenant_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant ON catalog_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_kind ON catalog_items(kind);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name ON catalog_items(name COLLATE "nocase");
CREATE INDEX IF NOT EXISTS idx_catalog_price_history_item
	ON catalog_item_price_history(catalog_item_id, effective_from);
`

// postgresSeed matches what migrations v10 and v6 leave behind on SQLite: the
// production tenant, and the default firm name scoped to it. Both are
// conflict-tolerant so a re-run (or a database restored from a data migration
// that already carries these rows) is a no-op.
const postgresSeed = `
INSERT INTO tenants(id, slug, name)
	VALUES ('` + ProductionTenantID + `', '` + ProductionTenantSlug + `', '` + ProductionTenantName + `')
	ON CONFLICT (id) DO NOTHING;

INSERT INTO app_settings(tenant_id, key, value)
	VALUES ('` + ProductionTenantID + `', 'firm_name', '` + ProductionTenantName + `')
	ON CONFLICT (tenant_id, key) DO NOTHING;
`

// OpenPostgres connects to Postgres, applies the schema, and returns a store
// that is interchangeable with the SQLite one. dsn is a libpq/pgx connection
// string or URL, e.g. postgres://iris:secret@db:5432/iris?sslmode=disable
func OpenPostgres(ctx context.Context, dsn string) (*SQLStore, error) {
	if strings.TrimSpace(dsn) == "" {
		return nil, fmt.Errorf("postgres dsn is required")
	}

	db, err := sql.Open(postgresDriverName, dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres database: %w", err)
	}

	maxOpen := maxOpenConnsFromEnv()
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxOpen)
	db.SetConnMaxIdleTime(5 * time.Minute)
	// Postgres drops idle connections and restarts independently of the API, so
	// connections are recycled rather than held for the process lifetime.
	db.SetConnMaxLifetime(time.Hour)

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	store := &SQLStore{db: db, dialect: dialectPostgres}
	if err := runPostgresMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

// runPostgresMigrations brings a Postgres database up to date. A fresh database
// is created directly at postgresSchemaVersion; an existing one only picks up
// migrations newer than that.
func runPostgresMigrations(ctx context.Context, db *sql.DB) error {
	if err := execPostgresScript(ctx, db, postgresSchema); err != nil {
		return fmt.Errorf("apply postgres schema: %w", err)
	}
	if err := execPostgresScript(ctx, db, postgresSeed); err != nil {
		return fmt.Errorf("seed postgres schema: %w", err)
	}

	for version := 1; version <= postgresSchemaVersion; version++ {
		if _, err := db.ExecContext(
			ctx,
			`INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)`,
			version,
		); err != nil {
			return fmt.Errorf("record baseline migration %d: %w", version, err)
		}
	}

	for _, migration := range sqliteMigrations {
		if migration.version <= postgresSchemaVersion {
			continue
		}

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
			return fmt.Errorf(
				"migration %d is a SQLite-specific function migration and has no Postgres path",
				migration.version,
			)
		}
		if err := applyMigration(ctx, db, migration.version, migration.sql); err != nil {
			return err
		}
	}

	return nil
}

// execPostgresScript runs a multi-statement script one statement at a time.
// pgx uses the extended query protocol, which accepts a single statement per
// round trip, so the script cannot be handed over whole.
func execPostgresScript(ctx context.Context, db *sql.DB, script string) error {
	for _, statement := range strings.Split(script, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("run statement %q: %w", firstLine(statement), err)
		}
	}
	return nil
}

func firstLine(statement string) string {
	if index := strings.IndexByte(statement, '\n'); index >= 0 {
		return statement[:index]
	}
	return statement
}
