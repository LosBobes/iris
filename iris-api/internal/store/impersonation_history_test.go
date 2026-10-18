package store

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// migrateSQLiteBelow applies the SQLite migrations older than version, the
// way RunMigrations does, so a test can seed rows in the old shape.
func migrateSQLiteBelow(t *testing.T, ctx context.Context, db *sql.DB, version int) {
	t.Helper()
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		t.Fatal(err)
	}
	for _, migration := range sqliteMigrations {
		if migration.version >= version {
			break
		}
		if migration.fn != nil {
			if err := migration.fn(ctx, db); err != nil {
				t.Fatalf("migration %d: %v", migration.version, err)
			}
			if _, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)`, migration.version); err != nil {
				t.Fatal(err)
			}
			continue
		}
		if err := applyMigration(ctx, db, migration.version, migration.sql); err != nil {
			t.Fatal(err)
		}
	}
}

// TestImpersonationHistoryMigrationSQLite upgrades a v29 database holding
// impersonation history: rows, ids, the trail and the audit link survive, the
// organization's slug and name are backfilled, foreign keys are back on, and
// deleting the organization now detaches the history instead of deleting it.
func TestImpersonationHistoryMigrationSQLite(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", buildDSN(filepath.Join(t.TempDir(), "iris.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(2)
	migrateSQLiteBelow(t, ctx, db, 30)

	seed := []string{
		`INSERT INTO tenants(id, slug, name) VALUES ('t-old', 'stara', 'Stara firma')`,
		`INSERT INTO impersonation_events(id, admin_id, admin_username, tenant_id, user_id, username, ip, at, expires_at, reason)
		 VALUES (4, 'a1', 'ops', 't-old', 'u1', 'sef', '10.0.0.1', '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z', 'Podrška')`,
		`INSERT INTO impersonation_events(id, admin_id, admin_username, tenant_id, user_id, username, at, expires_at)
		 VALUES (9, 'a1', 'ops', 't-old', 'u1', 'sef', '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z')`,
		`DELETE FROM impersonation_events WHERE id = 9`,
		`INSERT INTO impersonation_actions(impersonation_id, at, method, route, path, status)
		 VALUES (4, '2026-10-01T10:05:00Z', 'PUT', '/customers/{id}', '/customers/c1', 200)`,
		`INSERT INTO platform_audit_events(at, admin_id, admin_username, action, tenant_id, tenant_slug, tenant_name, impersonation_id)
		 VALUES ('2026-10-01T10:00:00Z', 'a1', 'ops', 'impersonate', 't-old', 'stara', 'Stara firma', 4)`,
	}
	for _, statement := range seed {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	var slug, name, reason string
	if err := db.QueryRowContext(ctx, `SELECT tenant_slug, tenant_name, reason FROM impersonation_events WHERE id = 4`).Scan(&slug, &name, &reason); err != nil {
		t.Fatal(err)
	}
	if slug != "stara" || name != "Stara firma" || reason != "Podrška" {
		t.Fatalf("backfilled event = %q %q %q", slug, name, reason)
	}
	var notNull int
	if err := db.QueryRowContext(ctx, `SELECT "notnull" FROM pragma_table_info('impersonation_events') WHERE name = 'tenant_id'`).Scan(&notNull); err != nil {
		t.Fatal(err)
	}
	if notNull != 0 {
		t.Fatal("impersonation_events.tenant_id is still NOT NULL")
	}
	// Every pooled connection still enforces foreign keys.
	for i := 0; i < 2; i++ {
		var on int
		if err := db.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&on); err != nil || on != 1 {
			t.Fatalf("foreign_keys = %d, %v", on, err)
		}
	}
	// The id sequence did not move back: id 9 is never reused.
	result, err := db.ExecContext(ctx, `INSERT INTO impersonation_events(admin_id, admin_username, tenant_id, user_id, username, at, expires_at)
		VALUES ('a1', 'ops', 't-old', 'u1', 'sef', '2026-10-03T10:00:00Z', '2026-10-03T11:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	if id, _ := result.LastInsertId(); id != 10 {
		t.Fatalf("next impersonation id = %d, want 10", id)
	}

	if _, err := db.ExecContext(ctx, `DELETE FROM tenants WHERE id = 't-old'`); err != nil {
		t.Fatalf("delete tenant: %v", err)
	}
	var events, actions, linked int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_events WHERE tenant_id IS NULL`).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_actions WHERE impersonation_id = 4`).Scan(&actions); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM platform_audit_events WHERE impersonation_id = 4`).Scan(&linked); err != nil {
		t.Fatal(err)
	}
	if events != 2 || actions != 1 || linked != 1 {
		t.Fatalf("after tenant delete: events %d, actions %d, audit links %d; want 2, 1, 1", events, actions, linked)
	}
}

// TestPostgresImpersonationHistoryMigration rewinds a fresh Postgres database
// to the v29 shape of impersonation_events, seeds history, and runs v30 again.
func TestPostgresImpersonationHistoryMigration(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(postgresTestDSNEnv))
	if dsn == "" {
		t.Skipf("%s is not set; skipping Postgres migration test", postgresTestDSNEnv)
	}
	ctx := testTenantContext()
	store := newPostgresStoreForTest(t, ctx, dsn)
	defer store.Close()
	db := store.db

	rewind := []string{
		`ALTER TABLE impersonation_events DROP CONSTRAINT impersonation_events_tenant_id_fkey`,
		`ALTER TABLE impersonation_events DROP COLUMN tenant_slug`,
		`ALTER TABLE impersonation_events DROP COLUMN tenant_name`,
		`ALTER TABLE impersonation_events ALTER COLUMN tenant_id SET NOT NULL`,
		`ALTER TABLE impersonation_events ADD CONSTRAINT legacy_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
		`DELETE FROM schema_migrations WHERE version = 30`,
		`INSERT INTO tenants(id, slug, name) VALUES ('t-old', 'stara', 'Stara firma')`,
		`INSERT INTO impersonation_events(id, admin_id, admin_username, tenant_id, user_id, username, at, expires_at, reason)
		 VALUES (4, 'a1', 'ops', 't-old', 'u1', 'sef', '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z', 'Podrška')`,
		`INSERT INTO impersonation_actions(impersonation_id, at, method, route, path, status)
		 VALUES (4, '2026-10-01T10:05:00Z', 'PUT', '/customers/{id}', '/customers/c1', 200)`,
	}
	for _, statement := range rewind {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("rewind %q: %v", statement, err)
		}
	}
	if err := impersonationHistoryMigration(ctx, db); err != nil {
		t.Fatalf("v30 on Postgres: %v", err)
	}
	var slug, name string
	if err := db.QueryRowContext(ctx, `SELECT tenant_slug, tenant_name FROM impersonation_events WHERE id = 4`).Scan(&slug, &name); err != nil {
		t.Fatal(err)
	}
	if slug != "stara" || name != "Stara firma" {
		t.Fatalf("backfilled event = %q %q", slug, name)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM tenants WHERE id = 't-old'`); err != nil {
		t.Fatalf("delete tenant: %v", err)
	}
	var events, actions int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_events WHERE id = 4 AND tenant_id IS NULL`).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_actions WHERE impersonation_id = 4`).Scan(&actions); err != nil {
		t.Fatal(err)
	}
	if events != 1 || actions != 1 {
		t.Fatalf("after tenant delete: events %d, actions %d; want 1, 1", events, actions)
	}
}

// Organization delete keeps impersonation history (v30) on both engines: the
// event is detached (tenant_id NULL, slug/name kept), and the activity log and
// the per-request trail still read it.
func scenarioDeletedOrganizationKeepsImpersonationHistory(t *testing.T, ctx context.Context, store *SQLStore) {
	if err := store.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	admin, err := store.AuthenticatePlatformAdmin(ctx, "ops", "correct-horse-battery")
	if err != nil || admin == nil {
		t.Fatalf("AuthenticatePlatformAdmin = %v, %v", admin, err)
	}
	actor := AuditActor{AdminID: admin.ID, AdminUsername: admin.Username, IP: "127.0.0.1"}
	tenant, err := store.PlatformCreateTenant(ctx, actor, domain.PlatformCreateTenantInput{
		Name: "Odlazeća firma", Slug: "odlazi", AdminUsername: "sef", AdminPassword: "lozinka123",
	})
	if err != nil {
		t.Fatal(err)
	}
	user, err := store.AuthenticateUser(ctx, tenant.ID, "sef", "lozinka123")
	if err != nil || user == nil {
		t.Fatalf("AuthenticateUser = %v, %v", user, err)
	}
	if _, _, err := store.CreateImpersonationSession(ctx, ImpersonationInput{
		AdminID: admin.ID, AdminUsername: admin.Username, TenantID: tenant.ID, UserID: user.ID,
		ExpiresAt: time.Now().Add(time.Hour), Reason: "Izvoz pre gašenja",
	}); err != nil {
		t.Fatal(err)
	}
	var impersonationID int64
	if err := store.db.QueryRowContext(ctx, `SELECT id FROM impersonation_events WHERE tenant_id = ?`, tenant.ID).Scan(&impersonationID); err != nil {
		t.Fatal(err)
	}
	if err := store.RecordImpersonationAction(ctx, impersonationID, domain.PlatformImpersonationAction{
		At: time.Now().UTC().Format(time.RFC3339), Method: "POST", Route: "/customers", Path: "/customers", Status: 201,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.PlatformSetTenantSuspended(ctx, actor, "odlazi", true); err != nil {
		t.Fatal(err)
	}
	if deletion, err := store.PlatformDeleteTenant(ctx, actor, "odlazi", "odlazi"); err != nil || deletion == nil {
		t.Fatalf("PlatformDeleteTenant = %v, %v", deletion, err)
	}

	var tenantID sql.NullString
	var slug, name string
	if err := store.db.QueryRowContext(ctx, `SELECT tenant_id, tenant_slug, tenant_name FROM impersonation_events WHERE id = ?`, impersonationID).
		Scan(&tenantID, &slug, &name); err != nil {
		t.Fatalf("impersonation event after delete: %v", err)
	}
	if tenantID.Valid || slug != "odlazi" || name != "Odlazeća firma" {
		t.Fatalf("impersonation event after delete = %v %q %q", tenantID, slug, name)
	}
	actions, found, err := store.ImpersonationActions(ctx, impersonationID)
	if err != nil || !found || len(actions) != 1 {
		t.Fatalf("ImpersonationActions after delete = %+v, %v, %v", actions, found, err)
	}
	log, err := store.PlatformAuditLog(ctx, 20, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range log.Items {
		if event.Action != domain.AuditImpersonationStart || event.TenantSlug != "odlazi" {
			continue
		}
		if event.Impersonation == nil || event.Impersonation.ID != impersonationID ||
			event.Impersonation.ActionCount != 1 || event.Impersonation.Reason != "Izvoz pre gašenja" {
			t.Fatalf("activity log impersonation after delete = %+v", event.Impersonation)
		}
		return
	}
	t.Fatal("activity log lost the impersonation of the deleted organization")
}
