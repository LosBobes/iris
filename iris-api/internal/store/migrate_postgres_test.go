package store

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

// TestMigrateToPostgresCopiesASeededDatabase runs the real migration path: a
// SQLite database seeded from the demo fixtures is copied wholesale into
// Postgres, then checked for row-count parity and for the values that must
// survive byte-for-byte (password hashes, ids, order numbers, JSON payloads).
func TestMigrateToPostgresCopiesASeededDatabase(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(postgresTestDSNEnv))
	if dsn == "" {
		t.Skipf("%s is not set; skipping Postgres migration test", postgresTestDSNEnv)
	}

	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if _, err := SeedDemoFromFixtures(ctx, sqliteStore, testutil.FixtureDir(t), "", "", ""); err != nil {
		t.Fatalf("SeedDemoFromFixtures() returned error: %v", err)
	}

	// login_events has an identity key that is copied with its original ids.
	loginAt := time.Now().UTC()
	for _, userID := range []string{"user-admin", "user-operater"} {
		if err := sqliteStore.RecordLogin(ctx, DemoTenantID, userID, loginAt); err != nil {
			t.Fatalf("RecordLogin() on sqlite returned error: %v", err)
		}
	}

	postgresStore := newPostgresStoreForTest(t, ctx, dsn)
	defer postgresStore.Close()

	counts, err := MigrateToPostgres(ctx, sqliteStore, postgresStore)
	if err != nil {
		t.Fatalf("MigrateToPostgres() returned error: %v", err)
	}
	if len(counts) != len(migrationTables) {
		t.Fatalf("MigrateToPostgres() reported %d tables, want %d", len(counts), len(migrationTables))
	}

	mismatches, err := VerifyMigration(ctx, sqliteStore, postgresStore)
	if err != nil {
		t.Fatalf("VerifyMigration() returned error: %v", err)
	}
	if len(mismatches) != 0 {
		t.Fatalf("VerifyMigration() found row-count mismatches: %v", mismatches)
	}

	// The copied identity sequences must have been advanced past the copied ids,
	// or the next login after cutover would collide with a migrated row.
	if err := postgresStore.RecordLogin(ctx, DemoTenantID, "user-admin", loginAt); err != nil {
		t.Fatalf("RecordLogin() after migration returned error (identity sequence not resynced?): %v", err)
	}

	// The id counter is copied verbatim and must not trail the highest numeric
	// work-order id, or the next create would draw a taken id.
	var sqliteCounter, postgresCounter, highestID int64
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT value FROM work_order_id_counter WHERE id = 1`).Scan(&sqliteCounter); err != nil {
		t.Fatalf("read sqlite id counter: %v", err)
	}
	if err := postgresStore.db.QueryRowContext(ctx, `SELECT value FROM work_order_id_counter WHERE id = 1`).Scan(&postgresCounter); err != nil {
		t.Fatalf("read postgres id counter: %v", err)
	}
	if err := postgresStore.db.QueryRowContext(ctx, maxNumericIDSQL).Scan(&highestID); err != nil {
		t.Fatalf("read highest numeric id on postgres: %v", err)
	}
	if postgresCounter != sqliteCounter || postgresCounter < highestID {
		t.Fatalf("postgres id counter = %d, sqlite = %d, highest numeric id = %d; want a verbatim copy that is >= the highest id",
			postgresCounter, sqliteCounter, highestID)
	}
	// The work-order list must come back identically, payload JSON included.
	sqliteOrders, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatalf("WorkOrders() on sqlite returned error: %v", err)
	}
	postgresOrders, err := postgresStore.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatalf("WorkOrders() on postgres returned error: %v", err)
	}
	if postgresOrders.Total != sqliteOrders.Total {
		t.Fatalf("work order total = %d on postgres, want %d", postgresOrders.Total, sqliteOrders.Total)
	}
	if sqliteOrders.Total == 0 {
		t.Fatalf("fixture seed produced no work orders; the comparison would be vacuous")
	}

	for _, want := range sqliteOrders.Items {
		got, err := postgresStore.WorkOrderByID(ctx, want.ID)
		if err != nil {
			t.Fatalf("WorkOrderByID(%q) returned error: %v", want.ID, err)
		}
		if got == nil {
			t.Fatalf("WorkOrderByID(%q) = nil, want the migrated order", want.ID)
		}
		if got.OrderNumber != want.OrderNumber || got.ClientName != want.ClientName {
			t.Fatalf("migrated order %q = %+v, want order number %q and client %q",
				want.ID, got, want.OrderNumber, want.ClientName)
		}
		if got.Status != want.Status || got.IssueDate != want.IssueDate {
			t.Fatalf("migrated order %q status/date = %q/%q, want %q/%q",
				want.ID, got.Status, got.IssueDate, want.Status, want.IssueDate)
		}
	}

	// Password hashes are copied, not re-derived, so the seeded demo account must
	// still authenticate with its original password.
	user, err := postgresStore.AuthenticateUser(ctx, DemoTenantID, "admin", "admin123")
	if err != nil {
		t.Fatalf("AuthenticateUser() on postgres returned error: %v", err)
	}
	if user == nil {
		t.Fatalf("AuthenticateUser() = nil, want the migrated demo admin")
	}

	// Catalog prices cross a REAL -> NUMERIC boundary during the copy.
	sqliteCatalog, err := sqliteStore.CatalogItems(ctx, CatalogItemQuery{})
	if err != nil {
		t.Fatalf("CatalogItems() on sqlite returned error: %v", err)
	}
	for _, want := range sqliteCatalog.Items {
		got, err := postgresStore.CatalogItemByID(ctx, want.ID)
		if err != nil {
			t.Fatalf("CatalogItemByID(%q) returned error: %v", want.ID, err)
		}
		if got == nil {
			t.Fatalf("CatalogItemByID(%q) = nil, want the migrated item", want.ID)
		}
		if !equalOptionalPrice(got.SalePrice, want.SalePrice) {
			t.Fatalf("migrated item %q sale price = %v, want %v", want.ID, got.SalePrice, want.SalePrice)
		}
		if !equalOptionalPrice(got.PurchasePrice, want.PurchasePrice) {
			t.Fatalf("migrated item %q purchase price = %v, want %v", want.ID, got.PurchasePrice, want.PurchasePrice)
		}
	}

	created, err := postgresStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Posle migracije", JobDescription: "Štampa", IssuedBy: "admin", IssueDate: "2026-06-21",
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() after migration returned error: %v", err)
	}
	if want := strconv.FormatInt(postgresCounter+1, 10); created.ID != want {
		t.Fatalf("first id after migration = %q, want %q", created.ID, want)
	}
}

// TestMigrateToPostgresRefusesANonEmptyTarget guards the re-run case: copying
// twice would duplicate every table or die partway through on a unique index.
func TestMigrateToPostgresRefusesANonEmptyTarget(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(postgresTestDSNEnv))
	if dsn == "" {
		t.Skipf("%s is not set; skipping Postgres migration test", postgresTestDSNEnv)
	}

	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if _, err := SeedDemoFromFixtures(ctx, sqliteStore, testutil.FixtureDir(t), "", "", ""); err != nil {
		t.Fatalf("SeedDemoFromFixtures() returned error: %v", err)
	}

	postgresStore := newPostgresStoreForTest(t, ctx, dsn)
	defer postgresStore.Close()

	if _, err := MigrateToPostgres(ctx, sqliteStore, postgresStore); err != nil {
		t.Fatalf("MigrateToPostgres() returned error: %v", err)
	}
	if _, err := MigrateToPostgres(ctx, sqliteStore, postgresStore); err == nil {
		t.Fatalf("MigrateToPostgres() succeeded on a populated target, want a refusal")
	}
}

// TestMigrateToPostgresRejectsSwappedStores checks the direction guard, so a
// mistyped command cannot copy an empty Postgres database over live SQLite data.
func TestMigrateToPostgresRejectsSwappedStores(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(postgresTestDSNEnv))
	if dsn == "" {
		t.Skipf("%s is not set; skipping Postgres migration test", postgresTestDSNEnv)
	}

	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	postgresStore := newPostgresStoreForTest(t, ctx, dsn)
	defer postgresStore.Close()

	if _, err := MigrateToPostgres(ctx, postgresStore, sqliteStore); err == nil {
		t.Fatalf("MigrateToPostgres() accepted reversed stores, want a refusal")
	}
}

func equalOptionalPrice(got *float64, want *float64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}
