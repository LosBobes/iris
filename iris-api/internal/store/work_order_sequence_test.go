package store

import (
	"context"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func createTestOrder(t *testing.T, s *SQLiteStore, ctx context.Context, client string) *domain.WorkOrder {
	t.Helper()
	created, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     client,
		JobDescription: "Štampa",
		IssuedBy:       "admin",
		IssueDate:      "2026-06-21",
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder(%s): %v", client, err)
	}
	return created
}

func rawOrderRow(t *testing.T, s *SQLiteStore, id string) (tenant, client string) {
	t.Helper()
	if err := s.db.QueryRow(`SELECT tenant_id, client_name FROM work_orders WHERE id = ?`, id).Scan(&tenant, &client); err != nil {
		t.Fatalf("read order %s: %v", id, err)
	}
	return tenant, client
}

// TestCreateWorkOrderSkipsIDsWrittenBehindTheCounter: a numeric id written
// without raising the counter (older binary, manual SQL) must neither be
// overwritten by a create (same tenant) nor make the create write nothing and
// attach to it (other tenant).
func TestCreateWorkOrderSkipsIDsWrittenBehindTheCounter(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	tctx := testTenantContext()
	if err := s.EnsureTenant(ctx, "tenant-other", "druga", "Druga"); err != nil {
		t.Fatalf("EnsureTenant: %v", err)
	}

	first := createTestOrder(t, s, tctx, "Prvi")
	var counter int
	if err := s.db.QueryRow(`SELECT value FROM work_order_id_counter`).Scan(&counter); err != nil {
		t.Fatal(err)
	}

	// Rows at counter+1 (same tenant) and counter+2 (other tenant), written
	// straight into the table so the counter lags.
	insert := `INSERT INTO work_orders(id, tenant_id, order_number, client_name, job_description,
		issued_by, status, issue_date, payload, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'x', 'admin', 'new', '2026-01-01', '{}', '2026-01-01', '2026-01-01')`
	sameID, otherID := strconv.Itoa(counter+1), strconv.Itoa(counter+2)
	if _, err := s.db.Exec(insert, sameID, DemoTenantID, "RUCNO-1", "Ručno isti"); err != nil {
		t.Fatalf("seed same-tenant row: %v", err)
	}
	if _, err := s.db.Exec(insert, otherID, "tenant-other", "RUCNO-2", "Ručno drugi"); err != nil {
		t.Fatalf("seed other-tenant row: %v", err)
	}

	second := createTestOrder(t, s, tctx, "Drugi")
	if second.ID == first.ID || second.ID == sameID || second.ID == otherID {
		t.Fatalf("create reused id %s (first %s, taken %s, %s)", second.ID, first.ID, sameID, otherID)
	}
	if want := strconv.Itoa(counter + 3); second.ID != want {
		t.Fatalf("create id = %s, want %s (counter resynced to the real maximum)", second.ID, want)
	}
	if tenant, client := rawOrderRow(t, s, sameID); tenant != DemoTenantID || client != "Ručno isti" {
		t.Fatalf("same-tenant row changed: %s %s", tenant, client)
	}
	if tenant, client := rawOrderRow(t, s, otherID); tenant != "tenant-other" || client != "Ručno drugi" {
		t.Fatalf("other-tenant row changed: %s %s", tenant, client)
	}
	if tenant, client := rawOrderRow(t, s, second.ID); tenant != DemoTenantID || client != "Drugi" {
		t.Fatalf("created row = %s %s", tenant, client)
	}
	var processes int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM work_order_processes WHERE work_order_id IN (?, ?)`, sameID, otherID).Scan(&processes); err != nil {
		t.Fatal(err)
	}
	if processes != 0 {
		t.Fatalf("a process was attached to a pre-existing order (%d)", processes)
	}
}

// TestPutWorkOrderRaisesCounterAtomically: a directly put numeric id is never
// visible without the raised counter, so the next create skips past it.
func TestPutWorkOrderRaisesCounterAtomically(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	tctx := testTenantContext()
	if err := s.PutWorkOrder(tctx, domain.WorkOrder{ID: "900", OrderNumber: "RN-900", IssueDate: "2026-01-01", Status: domain.WorkOrderStatusNew, ClientName: "Uvoz"}); err != nil {
		t.Fatalf("put: %v", err)
	}
	if created := createTestOrder(t, s, tctx, "Novi"); created.ID != "901" {
		t.Fatalf("create after put = %s, want 901", created.ID)
	}
	if _, client := rawOrderRow(t, s, "900"); client != "Uvoz" {
		t.Fatalf("put row overwritten: %s", client)
	}
}

// TestCounterIgnoresNonNumericIDs: only all-digit ids feed the counter seed
// and resync ("12abc" must not count as 12, "demo-1" must not be cast).
func TestCounterIgnoresNonNumericIDs(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	for _, id := range []string{"7", "500abc", "demo-1", "12e3"} {
		if _, err := s.db.Exec(`INSERT INTO work_orders(id, tenant_id, order_number, client_name, job_description,
			issued_by, status, issue_date, payload, created_at, updated_at)
			VALUES (?, ?, ?, 'x', 'x', 'admin', 'new', '2026-01-01', '{}', '2026-01-01', '2026-01-01')`,
			id, DemoTenantID, "RN-"+id); err != nil {
			t.Fatalf("insert %s: %v", id, err)
		}
	}
	if _, err := s.db.Exec(`DELETE FROM work_order_id_counter`); err != nil {
		t.Fatal(err)
	}
	if got, err := nextSequence(ctx, s.db); err != nil || got != 8 {
		t.Fatalf("nextSequence after reseed = %d, %v; want 8", got, err)
	}
	if _, err := s.db.Exec(`UPDATE work_order_id_counter SET value = 0`); err != nil {
		t.Fatal(err)
	}
	if err := resyncSequence(ctx, s.db); err != nil {
		t.Fatal(err)
	}
	var value int
	if err := s.db.QueryRow(`SELECT value FROM work_order_id_counter`).Scan(&value); err != nil || value != 7 {
		t.Fatalf("resynced counter = %d, %v; want 7", value, err)
	}
}
