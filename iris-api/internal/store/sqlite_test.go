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
	if result.Total != 25 || len(result.Items) != 10 {
		t.Fatalf("result = %#v, want total 25 and limited page", result)
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

func newSQLiteStoreForTest(t *testing.T, ctx context.Context, path string) *SQLiteStore {
	t.Helper()
	sqliteStore, err := OpenSQLite(ctx, path)
	if err != nil {
		t.Fatalf("OpenSQLite() returned error: %v", err)
	}
	return sqliteStore
}
