package store

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func queryPlan(t *testing.T, s *SQLiteStore, query string, args ...any) string {
	t.Helper()
	rows, err := s.db.Query("EXPLAIN QUERY PLAN "+query, args...)
	if err != nil {
		t.Fatalf("explain: %v", err)
	}
	defer rows.Close()
	var lines []string
	for rows.Next() {
		var id, parent, unused int
		var detail string
		if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
			t.Fatalf("scan plan: %v", err)
		}
		lines = append(lines, detail)
	}
	return strings.Join(lines, "\n")
}

func TestStockQueriesUseLedgerIndexes(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()

	cases := map[string]struct {
		query string
		args  []any
		index string
	}{
		"catalog on-hand subquery": {
			`SELECT (SELECT SUM(sm.quantity) FROM stock_movements sm
			         WHERE sm.catalog_item_id = catalog_items.id AND sm.tenant_id = catalog_items.tenant_id)
			 FROM catalog_items WHERE tenant_id = ?`, []any{"t"}, "idx_stock_movements_tenant_item_created",
		},
		"stock levels join": {
			`SELECT c.id, COALESCE(SUM(m.quantity), 0) FROM catalog_items c
			 LEFT JOIN stock_movements m ON m.catalog_item_id = c.id AND m.tenant_id = c.tenant_id
			 WHERE c.tenant_id = ? AND c.kind = 'article' GROUP BY c.id`, []any{"t"}, "idx_stock_movements_tenant_item_created",
		},
		"history newest first": {
			`SELECT m.id FROM stock_movements m WHERE m.tenant_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 50`,
			[]any{"t"}, "idx_stock_movements_tenant_created",
		},
		"history per item": {
			`SELECT m.id FROM stock_movements m WHERE m.tenant_id = ? AND m.catalog_item_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 50`,
			[]any{"t", "i"}, "idx_stock_movements_tenant_item_created",
		},
		"expired session sweep": {
			`DELETE FROM sessions WHERE expires_at <= ?`, []any{"2026-01-01T00:00:00Z"}, "idx_sessions_expires_at",
		},
	}
	for name, tc := range cases {
		plan := queryPlan(t, s, tc.query, tc.args...)
		t.Logf("%s:\n%s", name, plan)
		if !strings.Contains(plan, tc.index) {
			t.Errorf("%s: plan does not use %s:\n%s", name, tc.index, plan)
		}
		if strings.Contains(plan, "USE TEMP B-TREE FOR ORDER BY") {
			t.Errorf("%s: plan sorts in a temp b-tree:\n%s", name, plan)
		}
	}
}

func TestWorkOrderSequenceCounter(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	tctx := testTenantContext()

	// A directly stored numeric id raises the counter; non-numeric ids do not.
	for _, id := range []string{"41", "wo-cob-9"} {
		if err := s.PutWorkOrder(tctx, domain.WorkOrder{ID: id, OrderNumber: "RN-2026-" + id, IssueDate: "2026-01-01", Status: domain.WorkOrderStatusNew}); err != nil {
			t.Fatalf("put %s: %v", id, err)
		}
	}
	for _, want := range []int{42, 43} {
		got, err := nextSequence(ctx, s.db)
		if err != nil || got != want {
			t.Fatalf("nextSequence = %d, %v; want %d", got, err, want)
		}
	}
	// Putting a lower numeric id leaves the counter alone.
	if err := s.PutWorkOrder(tctx, domain.WorkOrder{ID: "5", OrderNumber: "RN-2026-5", IssueDate: "2026-01-01", Status: domain.WorkOrderStatusNew}); err != nil {
		t.Fatalf("put 5: %v", err)
	}
	if got, _ := nextSequence(ctx, s.db); got != 44 {
		t.Fatalf("nextSequence after lower put = %d, want 44", got)
	}
}

func TestMigrationSeedsWorkOrderCounterFromExistingIDs(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "iris.db")
	s := newSQLiteStoreForTest(t, ctx, path)
	tctx := testTenantContext()
	if err := s.PutWorkOrder(tctx, domain.WorkOrder{ID: "7", OrderNumber: "RN-2026-7", IssueDate: "2026-01-01", Status: domain.WorkOrderStatusNew}); err != nil {
		t.Fatalf("put: %v", err)
	}
	// Simulate a database from before v23: no counter, migration not recorded.
	for _, stmt := range []string{
		`DROP TABLE work_order_id_counter`,
		`DELETE FROM schema_migrations WHERE version = 23`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	s.Close()

	s = newSQLiteStoreForTest(t, ctx, path)
	defer s.Close()
	if got, err := nextSequence(ctx, s.db); err != nil || got != 8 {
		t.Fatalf("nextSequence after re-migration = %d, %v; want 8", got, err)
	}
}

func TestMetadataCachesInvalidateOnWrite(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	tctx := testTenantContext()

	before, err := s.OrganizationSettings(tctx)
	if err != nil {
		t.Fatalf("settings: %v", err)
	}
	// Mutating the returned value must not corrupt the cache.
	before.PrintItemColumns[0] = "bogus"
	name := "Nova firma"
	if _, err := s.UpdateOrganizationSettings(tctx, domain.OrganizationSettingsUpdate{FirmName: &name}); err != nil {
		t.Fatalf("update settings: %v", err)
	}
	after, _ := s.OrganizationSettings(tctx)
	if after.FirmName != name || after.PrintItemColumns[0] == "bogus" {
		t.Fatalf("settings after update = %+v", after)
	}

	hasRolna := func() bool {
		values, err := s.EnumValues(tctx)
		if err != nil {
			t.Fatalf("enum values: %v", err)
		}
		for _, v := range values {
			if v.Field == domain.EnumFieldInvoiceUnit && v.Value == "rolna" {
				return true
			}
		}
		return false
	}
	if hasRolna() {
		t.Fatal("value present before create")
	}
	created, err := s.CreateEnumValue(tctx, domain.EnumValueInput{Field: domain.EnumFieldInvoiceUnit, Value: "rolna", Label: "rolna"})
	if err != nil {
		t.Fatalf("create enum: %v", err)
	}
	if !hasRolna() {
		t.Fatal("enum create did not invalidate the cache")
	}
	if err := s.DeleteEnumValue(tctx, created.ID); err != nil {
		t.Fatalf("delete enum: %v", err)
	}
	if hasRolna() {
		t.Fatal("enum delete did not invalidate the cache")
	}
}

func TestTenantCacheConcurrentUse(t *testing.T) {
	var c tenantCache[int]
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 500; j++ {
				tenant := []string{"a", "b"}[j%2]
				if _, ok := c.get(tenant); !ok {
					c.put(tenant, c.generation(tenant), j)
				}
				if j%50 == 0 {
					c.invalidate(tenant)
				}
				if j%200 == 0 {
					c.invalidateAll()
				}
			}
		}(i)
	}
	wg.Wait()
}

func TestStaleLoadIsNotCachedAfterInvalidate(t *testing.T) {
	var c tenantCache[string]
	gen := c.generation("a")
	c.invalidate("a") // a write lands while the load is in flight
	c.put("a", gen, "stale")
	if _, ok := c.get("a"); ok {
		t.Fatal("stale value was cached")
	}
}

func TestLocationByID(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	tctx := testTenantContext()

	if _, err := s.UpsertCustomer(tctx, domain.Customer{ID: "c1", Name: "Firma"}); err != nil {
		t.Fatalf("customer: %v", err)
	}
	addr := "Ulica 1"
	if _, err := s.UpsertLocation(tctx, domain.Location{ID: "l1", CustomerID: "c1", Name: "Sediste", Address: &addr}); err != nil {
		t.Fatalf("location: %v", err)
	}
	got, err := s.LocationByID(tctx, "", "l1")
	if err != nil || got == nil || got.Address == nil || *got.Address != addr {
		t.Fatalf("LocationByID = %+v, %v", got, err)
	}
	if got, _ := s.LocationByID(tctx, "c1", "l1"); got == nil {
		t.Fatal("matching customer filter should find the location")
	}
	if got, _ := s.LocationByID(tctx, "other", "l1"); got != nil {
		t.Fatal("non-matching customer filter must not find the location")
	}
	if got, _ := s.LocationByID(tctx, "", "missing"); got != nil {
		t.Fatal("unknown id must return nil")
	}
	if err := s.EnsureTenant(ctx, "t2", "t2", "T2"); err != nil {
		t.Fatalf("tenant: %v", err)
	}
	if got, _ := s.LocationByID(ContextWithTenant(ctx, "t2"), "", "l1"); got != nil {
		t.Fatal("location of another tenant must not be visible")
	}
}
