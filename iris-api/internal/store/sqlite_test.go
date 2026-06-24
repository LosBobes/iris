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
	ctx := context.Background()
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

func TestSQLiteStoreAuthSessionsAndBackup(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	if err := sqliteStore.CreateUser(ctx, "u-1", "admin", "sifra", domain.RoleAdmin, false); err != nil {
		t.Fatalf("CreateUser() returned error: %v", err)
	}
	user, err := sqliteStore.AuthenticateUser(ctx, "admin", "sifra")
	if err != nil {
		t.Fatalf("AuthenticateUser() returned error: %v", err)
	}
	if user == nil || user.Role != domain.RoleAdmin {
		t.Fatalf("user = %#v, want admin", user)
	}
	if wrong, err := sqliteStore.AuthenticateUser(ctx, "admin", "bad"); err != nil || wrong != nil {
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
	ctx := context.Background()
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
	ctx := context.Background()
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
	return sqliteStore
}
