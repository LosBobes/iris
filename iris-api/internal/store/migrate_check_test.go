package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// TestMigrationTablesCoverEverySQLiteTable fails when a migration adds a table
// that migrate-to-postgres neither copies nor lists in migrationExcludedTables.
// Without it a new table would be silently left behind at cutover.
func TestMigrationTablesCoverEverySQLiteTable(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	uncovered, err := UncoveredTables(ctx, sqliteStore)
	if err != nil {
		t.Fatalf("UncoveredTables() returned error: %v", err)
	}
	if len(uncovered) > 0 {
		t.Fatalf("tables missing from migrationTables (add them, in foreign-key order, or to migrationExcludedTables with a reason): %v", uncovered)
	}

	// Stale entries would make verifyTargetIsEmpty/copy fail at cutover instead.
	for _, table := range migrationTables {
		var name string
		if err := sqliteStore.db.QueryRowContext(ctx,
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name); err != nil {
			t.Fatalf("migrationTables lists %q, which is not a SQLite table: %v", table, err)
		}
	}
}

func TestValidateSQLiteSourceFile(t *testing.T) {
	dir := t.TempDir()
	if err := ValidateSQLiteSourceFile(filepath.Join(dir, "missing.db")); err == nil {
		t.Fatalf("missing file accepted")
	}
	if err := ValidateSQLiteSourceFile(dir); err == nil {
		t.Fatalf("directory accepted")
	}
	empty := filepath.Join(dir, "empty.db")
	if err := os.WriteFile(empty, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLiteSourceFile(empty); err == nil {
		t.Fatalf("empty file accepted")
	}
	real := filepath.Join(dir, "real.db")
	if err := os.WriteFile(real, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLiteSourceFile(real); err != nil {
		t.Fatalf("non-empty regular file rejected: %v", err)
	}
	// The validation must not create anything.
	if _, err := os.Stat(filepath.Join(dir, "missing.db")); !os.IsNotExist(err) {
		t.Fatalf("validation created the missing file")
	}
}

func TestInspectMigrationSourceRefusesAFreshDatabase(t *testing.T) {
	ctx := context.Background()
	// A fresh database is what OpenSQLite makes out of a mistyped path.
	fresh, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "typo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer fresh.Close()

	_, err = InspectMigrationSource(ctx, fresh)
	if err == nil || !strings.Contains(err.Error(), "users") {
		t.Fatalf("InspectMigrationSource() = %v, want a refusal naming the empty users table", err)
	}
}

func TestInspectMigrationSourceReportsProblems(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if err := sqliteStore.CreateUser(ctx, "user-a", "ana", "lozinka-lozinka-1", domain.RoleAdmin, false); err != nil {
		t.Fatalf("CreateUser() returned error: %v", err)
	}

	report, err := InspectMigrationSource(ctx, sqliteStore)
	if err != nil {
		t.Fatalf("InspectMigrationSource() returned error: %v", err)
	}
	if len(report.Problems) != 0 || len(report.Uncovered) != 0 {
		t.Fatalf("clean database reported problems=%v uncovered=%v", report.Problems, report.Uncovered)
	}
	if report.SchemaVersion == 0 {
		t.Fatalf("SchemaVersion = 0")
	}

	year := time.Now().UTC().Year()
	if err := sqliteStore.PutWorkOrder(ctx, domain.WorkOrder{
		ID: "wo-bad", OrderNumber: formatOrderNumber(year, 5) + "/A", ClientName: "K", JobDescription: "J",
		IssuedBy: "admin", IssueDate: "2026-01-01", Status: domain.WorkOrderStatusNew,
	}); err != nil {
		t.Fatalf("PutWorkOrder() returned error: %v", err)
	}
	if _, err := sqliteStore.db.ExecContext(ctx, `UPDATE work_orders SET price = 1.23456 WHERE id = 'wo-bad'`); err != nil {
		t.Fatal(err)
	}

	report, err = InspectMigrationSource(ctx, sqliteStore)
	if err != nil {
		t.Fatalf("InspectMigrationSource() returned error: %v", err)
	}
	joined := strings.Join(report.Problems, "\n")
	if !strings.Contains(joined, "/A") || !strings.Contains(joined, "work_orders.price") {
		t.Fatalf("Problems = %v, want the order number suffix and work_orders.price", report.Problems)
	}
}

// scenarioNextOrderNumberIgnoresNonDigitSuffixes runs on both engines: the
// suffix is cast to an integer, which SQLite tolerates ("12/A" -> 12) but
// Postgres rejects. Such numbers must be skipped, not abort order creation.
func scenarioNextOrderNumberIgnoresNonDigitSuffixes(t *testing.T, ctx context.Context, store *SQLStore) {
	year := time.Now().UTC().Year()
	for id, number := range map[string]string{
		"wo-ok":    formatOrderNumber(year, 7),
		"wo-slash": formatOrderNumber(year, 12) + "/A",
		"wo-empty": fmt.Sprintf("RN-%d-", year),
	} {
		if err := store.PutWorkOrder(ctx, domain.WorkOrder{
			ID: id, OrderNumber: number, ClientName: "K", JobDescription: "J",
			IssuedBy: "admin", IssueDate: "2026-01-01", Status: domain.WorkOrderStatusNew,
		}); err != nil {
			t.Fatalf("PutWorkOrder(%q) returned error: %v", number, err)
		}
	}

	reserved, err := store.ReserveOrderNumber(ctx, "operater-a")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() returned error: %v", err)
	}
	if want := formatOrderNumber(year, 8); reserved.OrderNumber != want {
		t.Fatalf("ReserveOrderNumber() = %q, want %q (non-digit suffixes ignored)", reserved.OrderNumber, want)
	}
}

// seedOrphanedPriceHistory reproduces the cutover incident: catalog items
// deleted on a connection that was not enforcing foreign keys, so ON DELETE
// CASCADE never removed their price history.
func seedOrphanedPriceHistory(t *testing.T, ctx context.Context, sqliteStore *SQLStore, items int) {
	t.Helper()
	conn, err := sqliteStore.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		t.Fatal(err)
	}
	// The connection goes back to the pool; it must not keep FKs off.
	defer func() {
		if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
			t.Fatal(err)
		}
	}()
	for i := 0; i < items; i++ {
		id := fmt.Sprintf("cat-orphan-%d", i)
		for _, statement := range []string{
			`INSERT INTO catalog_items(id, tenant_id, code, name, kind) VALUES ('` + id + `', '` + DemoTenantID + `', '` + id + `', 'Artikal', 'article')`,
			`INSERT INTO catalog_item_price_history(id, catalog_item_id, purchase_price, sale_price, effective_from) VALUES ('cph-` + id + `', '` + id + `', 1, 2, '2026-01-01')`,
			`DELETE FROM catalog_items WHERE id = '` + id + `'`,
		} {
			if _, err := conn.ExecContext(ctx, statement); err != nil {
				t.Fatalf("%s: %v", statement, err)
			}
		}
	}
}

func TestInspectMigrationSourceReportsForeignKeyViolations(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	if err := sqliteStore.CreateUser(ctx, "user-a", "ana", "lozinka-lozinka-1", domain.RoleAdmin, false); err != nil {
		t.Fatalf("CreateUser() returned error: %v", err)
	}

	report, err := InspectMigrationSource(ctx, sqliteStore)
	if err != nil {
		t.Fatalf("InspectMigrationSource() returned error: %v", err)
	}
	if len(report.ForeignKeyViolations) != 0 {
		t.Fatalf("clean database reported foreign key violations: %v", report.ForeignKeyViolations)
	}

	seedOrphanedPriceHistory(t, ctx, sqliteStore, 3)

	report, err = InspectMigrationSource(ctx, sqliteStore)
	if err != nil {
		t.Fatalf("InspectMigrationSource() returned error: %v", err)
	}
	want := ForeignKeyViolation{
		Table: "catalog_item_price_history", Columns: "catalog_item_id",
		Parent: "catalog_items", ParentColumns: "id", OnDelete: "CASCADE", Rows: 3,
	}
	if len(report.ForeignKeyViolations) != 1 || report.ForeignKeyViolations[0] != want {
		t.Fatalf("ForeignKeyViolations = %+v, want [%+v]", report.ForeignKeyViolations, want)
	}
	if got, wantLine := want.String(), "strani ključ: 3 redova u catalog_item_price_history (catalog_item_id) upućuje na nepostojeće redove u catalog_items (id)"; got != wantLine {
		t.Fatalf("String() = %q, want %q", got, wantLine)
	}
	cleanup := want.CleanupSQL()
	if cleanup != "DELETE FROM catalog_item_price_history WHERE catalog_item_id NOT IN (SELECT id FROM catalog_items);" {
		t.Fatalf("CleanupSQL() = %q", cleanup)
	}

	// The suggested statement clears exactly the orphans, and the check passes.
	var before int
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM catalog_item_price_history`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := sqliteStore.db.ExecContext(ctx, cleanup); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	var after int
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM catalog_item_price_history`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if before-after != 3 {
		t.Fatalf("cleanup removed %d rows, want 3", before-after)
	}
	violations, err := ForeignKeyViolations(ctx, sqliteStore)
	if err != nil || len(violations) != 0 {
		t.Fatalf("ForeignKeyViolations() after cleanup = %v, %v", violations, err)
	}
}

// TestMigrateToPostgresRefusesForeignKeyViolations needs no Postgres: the
// source is checked before the target is even looked at, so the copy never
// starts (and never fails halfway with SQLSTATE 23503).
func TestMigrateToPostgresRefusesForeignKeyViolations(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	seedOrphanedPriceHistory(t, ctx, sqliteStore, 2)

	notPostgres := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "target.db"))
	defer notPostgres.Close()

	_, err := MigrateToPostgres(ctx, sqliteStore, notPostgres)
	var violationsErr *ForeignKeyViolationsError
	if !errors.As(err, &violationsErr) {
		t.Fatalf("MigrateToPostgres() = %v, want a ForeignKeyViolationsError", err)
	}
	message := err.Error()
	for _, want := range []string{
		"SQLSTATE 23503",
		"2 redova u catalog_item_price_history (catalog_item_id)",
		"DELETE FROM catalog_item_price_history WHERE catalog_item_id NOT IN (SELECT id FROM catalog_items);",
		"migrate-to-postgres -check",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("error %q does not mention %q", message, want)
		}
	}
}

func TestForeignKeyViolationCleanupSQL(t *testing.T) {
	setNull := ForeignKeyViolation{Table: "work_orders", Columns: "customer_id", Parent: "customers", ParentColumns: "id", OnDelete: "SET NULL"}
	if got := setNull.CleanupSQL(); got != "UPDATE work_orders SET customer_id = NULL WHERE customer_id NOT IN (SELECT id FROM customers);" {
		t.Fatalf("SET NULL cleanup = %q", got)
	}
	for _, violation := range []ForeignKeyViolation{
		{Table: "a", Columns: "b_id", Parent: "b", ParentColumns: "id", OnDelete: "NO ACTION"},
		{Table: "a", Columns: "b_id", Parent: "b", ParentColumns: "id", OnDelete: "RESTRICT"},
		{Table: "a", Columns: "x, y", Parent: "b", ParentColumns: "x, y", OnDelete: "CASCADE"},
		// The stock ledger is append-only: never suggest deleting movements.
		{Table: "stock_movements", Columns: "catalog_item_id", Parent: "catalog_items", ParentColumns: "id", OnDelete: "CASCADE"},
	} {
		if got := violation.CleanupSQL(); got != "" {
			t.Fatalf("CleanupSQL(%+v) = %q, want no automatic fix", violation, got)
		}
		if hint := violation.Hint(); strings.Contains(hint, "DELETE") || strings.Contains(hint, "UPDATE") {
			t.Fatalf("Hint(%+v) = %q, want a manual instruction", violation, hint)
		}
	}
	stock := ForeignKeyViolation{Table: "stock_movements", Columns: "catalog_item_id", Parent: "catalog_items", ParentColumns: "id", OnDelete: "CASCADE"}
	if hint := stock.Hint(); !strings.Contains(hint, "rezervne kopije") {
		t.Fatalf("stock hint = %q, want the restore-from-backup instruction", hint)
	}
}
