package store

import (
	"context"
	"path/filepath"
	"reflect"
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
	if workOrder == nil || workOrder.OrderNumber != "RN-2024-00001" {
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

// TestSQLiteStoreReserveOrderNumber covers the "reserve on open" flow: distinct
// numbers for concurrent operators, fresh creates skipping live reservations, and
// consuming a reserved number at create time.
func TestSQLiteStoreReserveOrderNumber(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	year := time.Now().UTC().Year()
	issueDate := time.Now().UTC().Format("2006-01-02")

	a, err := sqliteStore.ReserveOrderNumber(ctx, "admin")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() a: %v", err)
	}
	if want := formatOrderNumber(year, 1); a.OrderNumber != want {
		t.Fatalf("first reservation = %q, want %q", a.OrderNumber, want)
	}

	// A concurrent second reservation must not repeat the first live number.
	b, err := sqliteStore.ReserveOrderNumber(ctx, "admin")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() b: %v", err)
	}
	if want := formatOrderNumber(year, 2); b.OrderNumber != want {
		t.Fatalf("second reservation = %q, want %q", b.OrderNumber, want)
	}

	// A create without a reserved number must skip past both live reservations.
	fresh, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Fresh", JobDescription: "job", IssuedBy: "admin", IssueDate: issueDate,
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() fresh: %v", err)
	}
	if want := formatOrderNumber(year, 3); fresh.OrderNumber != want {
		t.Fatalf("fresh order number = %q, want %q", fresh.OrderNumber, want)
	}

	// Creating with reservation b's number consumes it and keeps that exact number.
	reserved, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		OrderNumber: &b.OrderNumber,
		ClientName:  "Reserved", JobDescription: "job", IssuedBy: "admin", IssueDate: issueDate,
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() reserved: %v", err)
	}
	if reserved.OrderNumber != b.OrderNumber {
		t.Fatalf("reserved order number = %q, want %q", reserved.OrderNumber, b.OrderNumber)
	}

	// Reservation a is still outstanding and b is consumed; the next reservation
	// must clear the highest committed number (0003), not reuse a's 0001.
	c, err := sqliteStore.ReserveOrderNumber(ctx, "admin")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() c: %v", err)
	}
	if want := formatOrderNumber(year, 4); c.OrderNumber != want {
		t.Fatalf("third reservation = %q, want %q", c.OrderNumber, want)
	}
}

// TestSQLiteStoreReleaseOrderNumber verifies a released reservation is reclaimed
// immediately instead of leaving a gap until it would have expired.
func TestSQLiteStoreReleaseOrderNumber(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	year := time.Now().UTC().Year()

	a, err := sqliteStore.ReserveOrderNumber(ctx, "admin")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() a: %v", err)
	}
	if want := formatOrderNumber(year, 1); a.OrderNumber != want {
		t.Fatalf("first reservation = %q, want %q", a.OrderNumber, want)
	}

	if err := sqliteStore.ReleaseOrderNumber(ctx, a.OrderNumber); err != nil {
		t.Fatalf("ReleaseOrderNumber() returned error: %v", err)
	}

	// The released number is free again, so the next reservation reuses it.
	b, err := sqliteStore.ReserveOrderNumber(ctx, "admin")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() b: %v", err)
	}
	if b.OrderNumber != a.OrderNumber {
		t.Fatalf("reservation after release = %q, want reclaimed %q", b.OrderNumber, a.OrderNumber)
	}

	// Releasing an unknown number is a no-op.
	if err := sqliteStore.ReleaseOrderNumber(ctx, formatOrderNumber(year, 999)); err != nil {
		t.Fatalf("ReleaseOrderNumber() unknown: %v", err)
	}
}

// TestSQLiteStoreEditLock covers the pessimistic edit lock: a second operator is
// refused while the first holds it, the holder can refresh, and releasing frees it.
func TestSQLiteStoreEditLock(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	lock, acquired, err := sqliteStore.AcquireEditLock(ctx, "wo-1", "marko")
	if err != nil {
		t.Fatalf("AcquireEditLock() marko: %v", err)
	}
	if !acquired || lock.LockedBy != "marko" || lock.ExpiresAt == "" {
		t.Fatalf("lock = %#v, acquired = %v, want marko holding with expiry", lock, acquired)
	}

	// A different operator is refused and told who holds it.
	held, acquired, err := sqliteStore.AcquireEditLock(ctx, "wo-1", "ana")
	if err != nil {
		t.Fatalf("AcquireEditLock() ana: %v", err)
	}
	if acquired {
		t.Fatalf("ana acquired = true, want refused while marko holds the lock")
	}
	if held.LockedBy != "marko" {
		t.Fatalf("held.LockedBy = %q, want marko", held.LockedBy)
	}

	// The holder refreshing (heartbeat) keeps the lock and its original lockedAt.
	refreshed, acquired, err := sqliteStore.AcquireEditLock(ctx, "wo-1", "marko")
	if err != nil {
		t.Fatalf("AcquireEditLock() marko refresh: %v", err)
	}
	if !acquired || refreshed.LockedAt != lock.LockedAt {
		t.Fatalf("refresh = %#v, acquired = %v, want same lockedAt %q held", refreshed, acquired, lock.LockedAt)
	}

	// A stale operator can't steal the lock by releasing it.
	if err := sqliteStore.ReleaseEditLock(ctx, "wo-1", "ana"); err != nil {
		t.Fatalf("ReleaseEditLock() ana: %v", err)
	}
	if _, acquired, _ := sqliteStore.AcquireEditLock(ctx, "wo-1", "ana"); acquired {
		t.Fatalf("ana acquired after no-op release, want marko still holding")
	}

	// The holder releasing frees the lock for the next operator.
	if err := sqliteStore.ReleaseEditLock(ctx, "wo-1", "marko"); err != nil {
		t.Fatalf("ReleaseEditLock() marko: %v", err)
	}
	if _, acquired, err := sqliteStore.AcquireEditLock(ctx, "wo-1", "ana"); err != nil || !acquired {
		t.Fatalf("ana acquire after release = %v, %v; want acquired", acquired, err)
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

	locations, err := sqliteStore.Locations(ctx, "")
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

// TestSQLiteStoreWorkOrderCollectionsNeverNull guards the read path against
// legacy JSON payloads that stored `null` for collection fields (nil slices
// marshal to null). Such orders crash clients that read `.length` without a nil
// guard, so WorkOrderByID/WorkOrders must coerce every collection to a non-nil
// slice.
func TestSQLiteStoreWorkOrderCollectionsNeverNull(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	// PutWorkOrder marshals the struct verbatim, so leaving the collection
	// fields as nil slices persists them as JSON `null` — reproducing legacy data.
	if err := sqliteStore.PutWorkOrder(ctx, domain.WorkOrder{
		ID:             "wo-legacy",
		OrderNumber:    "RN-2024-00099",
		ClientName:     "Legacy Co",
		JobDescription: "legacy order",
		IssuedBy:       "admin",
		IssueDate:      "2024-01-01",
		Status:         domain.WorkOrderStatusNew,
	}); err != nil {
		t.Fatalf("PutWorkOrder() returned error: %v", err)
	}

	got, err := sqliteStore.WorkOrderByID(ctx, "wo-legacy")
	if err != nil {
		t.Fatalf("WorkOrderByID() returned error: %v", err)
	}
	if got == nil {
		t.Fatal("WorkOrderByID() = nil, want the persisted order")
	}
	for _, field := range []struct {
		name  string
		value any
	}{
		{"StatusHistory", got.StatusHistory},
		{"InternalNotes", got.InternalNotes},
		{"CustomerNotes", got.CustomerNotes},
		{"Events", got.Events},
		{"Attachments", got.Attachments},
		{"MaterialUsage", got.MaterialUsage},
		{"TimeEntries", got.TimeEntries},
		{"InvoiceDraft.LineItems", got.InvoiceDraft.LineItems},
	} {
		if field.value == nil || reflect.ValueOf(field.value).IsNil() {
			t.Fatalf("%s = nil, want non-nil empty slice", field.name)
		}
	}

	list, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatalf("WorkOrders() returned error: %v", err)
	}
	var listed *domain.WorkOrder
	for i := range list.Items {
		if list.Items[i].ID == "wo-legacy" {
			listed = &list.Items[i]
			break
		}
	}
	if listed == nil {
		t.Fatal("WorkOrders() did not include the legacy order")
	}
	if listed.Events == nil || listed.InternalNotes == nil || listed.CustomerNotes == nil {
		t.Fatalf("WorkOrders() returned nil collection for legacy order: events=%v internalNotes=%v customerNotes=%v",
			listed.Events, listed.InternalNotes, listed.CustomerNotes)
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
