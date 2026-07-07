package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

// TestTenantIsolationMigrationBackfillsExistingData simulates the production
// upgrade: a database already populated under the pre-tenant schema (version 9)
// gets the tenant isolation migration applied. Every existing row must be
// attributed to the production tenant, stay queryable, and per-tenant uniqueness
// must now allow the same username/order number/code under a different tenant.
func TestTenantIsolationMigrationBackfillsExistingData(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "legacy.db")

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		t.Fatalf("enable fks: %v", err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		t.Fatalf("create schema_migrations: %v", err)
	}

	// Apply every migration up to (but not including) the tenant migration to
	// reproduce the old single-tenant schema.
	for _, migration := range sqliteMigrations {
		if migration.fn != nil {
			break
		}
		if err := applyMigration(ctx, db, migration.version, migration.sql); err != nil {
			t.Fatalf("apply migration %d: %v", migration.version, err)
		}
	}

	// Seed representative rows across the tables the migration rebuilds.
	seed := []string{
		`INSERT INTO users(id, username, password_hash, role) VALUES ('u1', 'admin', 'hash', 'admin')`,
		`INSERT INTO customers(id, name) VALUES ('c1', 'Postojeći klijent')`,
		`INSERT INTO locations(id, customer_id, name) VALUES ('l1', 'c1', 'Magacin')`,
		`INSERT INTO work_orders(id, order_number, client_name, job_description, issued_by, status, issue_date, payload, created_at, updated_at)
		 VALUES ('1', 'RN-2024-0001', 'Klijent', 'Posao', 'admin', 'new', '2024-01-01', '{}', '2024-01-01', '2024-01-01')`,
		`INSERT INTO catalog_items(id, code, name, kind) VALUES ('cat1', 'SIF-1', 'Štampa', 'service')`,
		`INSERT INTO enum_values(id, field, value, label) VALUES ('e1', 'status', 'x', 'X')`,
	}
	for _, statement := range seed {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	// Apply the tenant isolation migration.
	if err := tenantIsolationMigration(ctx, db); err != nil {
		t.Fatalf("tenantIsolationMigration: %v", err)
	}

	// The production tenant exists and every seeded row is attributed to it.
	assertTenant := func(table string) {
		t.Helper()
		var tenantID string
		if err := db.QueryRowContext(ctx, `SELECT tenant_id FROM `+table+` LIMIT 1`).Scan(&tenantID); err != nil {
			t.Fatalf("read tenant_id from %s: %v", table, err)
		}
		if tenantID != ProductionTenantID {
			t.Fatalf("%s.tenant_id = %q, want %q", table, tenantID, ProductionTenantID)
		}
	}
	for _, table := range []string{"users", "customers", "work_orders", "catalog_items", "enum_values"} {
		assertTenant(table)
	}

	var slug string
	if err := db.QueryRowContext(ctx, `SELECT slug FROM tenants WHERE id = ?`, ProductionTenantID).Scan(&slug); err != nil {
		t.Fatalf("read production tenant: %v", err)
	}
	if slug != ProductionTenantSlug {
		t.Fatalf("production slug = %q, want %q", slug, ProductionTenantSlug)
	}

	// The rebuilt schema must leave no dangling foreign keys.
	rows, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("foreign_key_check: %v", err)
	}
	if rows.Next() {
		rows.Close()
		t.Fatal("foreign_key_check reported violations after migration")
	}
	rows.Close()

	// Per-tenant uniqueness: a second tenant may reuse the same username, order
	// number and catalog code that the production tenant already holds.
	if _, err := db.ExecContext(ctx, `INSERT INTO tenants(id, slug, name) VALUES ('tenant-2', 'druga', 'Druga')`); err != nil {
		t.Fatalf("insert second tenant: %v", err)
	}
	reused := []string{
		`INSERT INTO users(id, tenant_id, username, password_hash, role) VALUES ('u2', 'tenant-2', 'admin', 'hash', 'admin')`,
		`INSERT INTO work_orders(id, tenant_id, order_number, client_name, job_description, issued_by, status, issue_date, payload, created_at, updated_at)
		 VALUES ('2', 'tenant-2', 'RN-2024-0001', 'K', 'P', 'admin', 'new', '2024-01-01', '{}', '2024-01-01', '2024-01-01')`,
		`INSERT INTO catalog_items(id, tenant_id, code, name, kind) VALUES ('cat2', 'tenant-2', 'SIF-1', 'Štampa', 'service')`,
	}
	for _, statement := range reused {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("reuse across tenant %q: %v", statement, err)
		}
	}
}
