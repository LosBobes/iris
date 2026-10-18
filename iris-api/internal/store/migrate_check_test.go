package store

import (
	"context"
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
