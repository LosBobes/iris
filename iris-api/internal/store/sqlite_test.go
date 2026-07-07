package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func TestSQLiteStoreSeedAndPersistWorkOrders(t *testing.T) {
	ctx := testTenantContext()
	dbPath := filepath.Join(t.TempDir(), "iris.db")
	sqliteStore := newSQLiteStoreForTest(t, ctx, dbPath)
	if err := SeedDemoFromFixtures(ctx, sqliteStore, testutil.FixtureDir(t)); err != nil {
		t.Fatalf("SeedDemoFromFixtures() returned error: %v", err)
	}

	result, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("WorkOrders() returned error: %v", err)
	}
	if result.Total != 43 || len(result.Items) != 10 {
		t.Fatalf("result = %#v, want total 43 and limited page", result)
	}
	if err := sqliteStore.Close(); err != nil {
		t.Fatalf("Close() returned error: %v", err)
	}

	reopened := newSQLiteStoreForTest(t, ctx, dbPath)
	defer reopened.Close()
	workOrder, err := reopened.WorkOrderByID(ctx, "1")
	if err != nil {
		t.Fatalf("WorkOrderByID() returned error: %v", err)
	}
	if workOrder == nil || workOrder.OrderNumber != "RN-2024-0001" {
		t.Fatalf("workOrder = %#v, want persisted fixture order", workOrder)
	}
}

// TestSQLiteStoreCreateWorkOrderNumberAvoidsCollision guards against deriving the
// order number from the numeric id sequence. Seeded data can have non-numeric ids
// (e.g. "wo-cob-1") with current-year order numbers; the next create must continue
// the order-number sequence rather than restart at 0001 and hit the UNIQUE index.
func TestSQLiteStoreCreateWorkOrderNumberAvoidsCollision(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	year := time.Now().UTC().Year()
	existingNumber := formatOrderNumber(year, 1)
	if err := sqliteStore.PutWorkOrder(ctx, domain.WorkOrder{
		ID:             "wo-cob-1", // non-numeric id, excluded from the id sequence
		OrderNumber:    existingNumber,
		ClientName:     "Seed Co",
		JobDescription: "seeded order",
		IssuedBy:       "admin",
		IssueDate:      time.Now().UTC().Format("2006-01-02"),
		Status:         domain.WorkOrderStatusNew,
	}); err != nil {
		t.Fatalf("PutWorkOrder() returned error: %v", err)
	}

	created, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "New Co",
		JobDescription: "fresh order",
		IssuedBy:       "admin",
		IssueDate:      time.Now().UTC().Format("2006-01-02"),
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}
	if created.OrderNumber == existingNumber {
		t.Fatalf("OrderNumber = %q, collided with existing seed order", created.OrderNumber)
	}
	if want := formatOrderNumber(year, 2); created.OrderNumber != want {
		t.Fatalf("OrderNumber = %q, want %q", created.OrderNumber, want)
	}
}

func TestSQLiteStoreAuthSessionsAndBackup(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	if err := sqliteStore.CreateUser(ctx, "u-1", "admin", "sifra", domain.RoleAdmin, false); err != nil {
		t.Fatalf("CreateUser() returned error: %v", err)
	}
	user, err := sqliteStore.AuthenticateUser(ctx, DemoTenantID, "admin", "sifra")
	if err != nil {
		t.Fatalf("AuthenticateUser() returned error: %v", err)
	}
	if user == nil || user.Role != domain.RoleAdmin {
		t.Fatalf("user = %#v, want admin", user)
	}
	if wrong, err := sqliteStore.AuthenticateUser(ctx, DemoTenantID, "admin", "bad"); err != nil || wrong != nil {
		t.Fatalf("wrong auth = %#v, %v; want nil, nil", wrong, err)
	}

	token, err := sqliteStore.CreateSession(ctx, user.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("CreateSession() returned error: %v", err)
	}
	sessionUser, err := sqliteStore.UserBySessionToken(ctx, token)
	if err != nil {
		t.Fatalf("UserBySessionToken() returned error: %v", err)
	}
	if sessionUser == nil || sessionUser.Username != "admin" {
		t.Fatalf("sessionUser = %#v, want admin", sessionUser)
	}
	backupPath := filepath.Join(t.TempDir(), "backup.db")
	if err := sqliteStore.Backup(ctx, backupPath); err != nil {
		t.Fatalf("Backup() returned error: %v", err)
	}
}

func TestSQLiteStoreEmptyListsAreNonNil(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	customers, err := sqliteStore.Customers(ctx, CustomerQuery{})
	if err != nil {
		t.Fatalf("Customers() returned error: %v", err)
	}
	if customers.Items == nil {
		t.Fatal("Customers().Items = nil, want empty slice")
	}

	locations, err := sqliteStore.Locations(ctx)
	if err != nil {
		t.Fatalf("Locations() returned error: %v", err)
	}
	if locations == nil {
		t.Fatal("Locations() = nil, want empty slice")
	}

	workOrders, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatalf("WorkOrders() returned error: %v", err)
	}
	if workOrders.Items == nil {
		t.Fatal("WorkOrders().Items = nil, want empty slice")
	}

	operators, err := sqliteStore.Operators(ctx)
	if err != nil {
		t.Fatalf("Operators() returned error: %v", err)
	}
	if operators == nil {
		t.Fatal("Operators() = nil, want empty slice")
	}
}

func TestOpenSQLiteCreatesParentDirectoryAndConfiguresConnection(t *testing.T) {
	ctx := testTenantContext()
	dbPath := filepath.Join(t.TempDir(), "nested", "data", "iris.db")
	sqliteStore := newSQLiteStoreForTest(t, ctx, dbPath)
	defer sqliteStore.Close()

	var busyTimeout int
	if err := sqliteStore.db.QueryRowContext(ctx, `PRAGMA busy_timeout`).Scan(&busyTimeout); err != nil {
		t.Fatalf("PRAGMA busy_timeout returned error: %v", err)
	}
	if busyTimeout != 5000 {
		t.Fatalf("busy_timeout = %d, want 5000", busyTimeout)
	}

	var foreignKeys int
	if err := sqliteStore.db.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&foreignKeys); err != nil {
		t.Fatalf("PRAGMA foreign_keys returned error: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("foreign_keys = %d, want 1", foreignKeys)
	}

	var journalMode string
	if err := sqliteStore.db.QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&journalMode); err != nil {
		t.Fatalf("PRAGMA journal_mode returned error: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal_mode = %q, want wal", journalMode)
	}
}

func newSQLiteStoreForTest(t *testing.T, ctx context.Context, path string) *SQLiteStore {
	t.Helper()
	sqliteStore, err := OpenSQLite(ctx, path)
	if err != nil {
		t.Fatalf("OpenSQLite() returned error: %v", err)
	}
	// Tests operate as the demo tenant; ensure it exists so tenant_id foreign keys
	// and per-tenant scoping resolve (SeedDemoFromFixtures also writes to it).
	if err := sqliteStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		t.Fatalf("EnsureTenant() returned error: %v", err)
	}
	return sqliteStore
}

// testTenantContext returns a context scoped to the demo tenant, which the
// SQLite-backed store tests use for every tenant-scoped call.
func testTenantContext() context.Context {
	return ContextWithTenant(context.Background(), DemoTenantID)
}
