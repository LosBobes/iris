package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/dashboard"
	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// referenceDashboard is the former implementation: load every order of the
// tenant with its full payload and aggregate all of them in Go. It is kept as
// the oracle buildDashboard (which prunes in SQL) must match byte for byte.
func referenceDashboard(t *testing.T, ctx context.Context, s *store.SQLiteStore, opts dashboard.Options) []byte {
	t.Helper()
	all, err := s.WorkOrders(ctx, store.WorkOrderListQuery{})
	if err != nil {
		t.Fatalf("list all work orders: %v", err)
	}
	out, err := json.Marshal(dashboard.Build(all.Items, opts))
	if err != nil {
		t.Fatalf("marshal reference dashboard: %v", err)
	}
	return out
}

func TestDashboardSQLPruningMatchesFullScan(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "iris.db")
	sqliteStore, err := store.OpenSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqliteStore.Close() })
	if err := sqliteStore.EnsureTenant(context.Background(), store.DemoTenantID, store.DemoTenantSlug, store.DemoTenantName); err != nil {
		t.Fatalf("ensure tenant: %v", err)
	}
	server := NewServer(sqliteStore)
	// A second handle for writing rows the store itself no longer produces.
	rawDB, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatalf("open raw db: %v", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	ctx := store.ContextWithTenant(context.Background(), store.DemoTenantID)

	rng := rand.New(rand.NewSource(42))
	statuses := []domain.WorkOrderStatus{
		domain.WorkOrderStatusNew, domain.WorkOrderStatusAssigned, domain.WorkOrderStatusInProgress,
		domain.WorkOrderStatusCompleted, domain.WorkOrderStatusInvoiced, domain.WorkOrderStatusCancelled,
		"draft", "active", // legacy statuses
	}
	users := []string{"admin", "operater", "ivan", "marija"}
	clients := []string{"Alpha d.o.o.", "Čačak štampa", "Đurđević", "Šumadija", "beta", "Ćirilica", "Zora"}
	methods := []domain.DeliveryMethod{
		domain.DeliveryMethodPickup, domain.DeliveryMethodPostExpress,
		domain.DeliveryMethodCityExpress, domain.DeliveryMethodFieldVisit,
	}
	pickDate := func(year, month, span int) string {
		return fmt.Sprintf("%04d-%02d-%02d", year, month, 1+rng.Intn(span))
	}

	for i := 0; i < 240; i++ {
		order := domain.WorkOrder{
			ID:          fmt.Sprintf("dash-%03d", i),
			OrderNumber: fmt.Sprintf("RN-2026-%04d", i),
			ClientName:  clients[rng.Intn(len(clients))],
			IssuedBy:    users[rng.Intn(len(users))],
			IssueDate:   pickDate(2025+rng.Intn(2), 1+rng.Intn(12), 28),
			Status:      statuses[rng.Intn(len(statuses))],
			IsCompleted: rng.Intn(3) == 0,
			CreatedAt:   fmt.Sprintf("2026-01-01T00:%02d:%02dZ", rng.Intn(60), rng.Intn(60)),
			UpdatedAt:   fmt.Sprintf("2026-02-01T00:%02d:%02dZ", rng.Intn(60), rng.Intn(60)),
		}
		if rng.Intn(5) > 0 {
			customer := fmt.Sprintf("cust-%d", rng.Intn(4))
			order.CustomerID = &customer
		}
		switch rng.Intn(4) {
		case 0: // unassigned (nil)
		case 1: // explicitly empty
			empty := ""
			order.Assignment.AssignedTo = &empty
		default:
			user := users[rng.Intn(len(users))]
			order.Assignment.AssignedTo = &user
		}
		switch rng.Intn(8) {
		case 0: // no due date
		case 1: // an empty due date (PATCH {"dueDate":""}, imports) means none
			empty := ""
			order.DueDate = &empty
		default:
			due := pickDate(2026, 5+rng.Intn(3), 28) // May-Jul around "today"
			order.DueDate = &due
		}
		if rng.Intn(5) > 0 {
			price := float64(rng.Intn(100000))/100 + 0.1
			order.Price = &price
		}
		if rng.Intn(2) == 0 {
			order.Shipping.DeliveryMethod = &methods[rng.Intn(len(methods))]
		}
		for line := 0; line < rng.Intn(4); line++ {
			cost := float64(rng.Intn(5000)) / 10
			item := domain.InvoiceLineItem{
				ID: fmt.Sprintf("l-%d-%d", i, line), Kind: domain.InvoiceLineItemKindService,
				Description: []string{"Štampa", "Papir", "Plakat", ""}[rng.Intn(4)],
				Quantity:    float64(1+rng.Intn(9)) / 3, Unit: "kom", UnitPrice: float64(rng.Intn(9000)) / 7,
			}
			if rng.Intn(2) == 0 {
				item.Kind = domain.InvoiceLineItemKindGoods
			}
			if rng.Intn(4) > 0 {
				item.UnitCost = &cost
			}
			order.InvoiceDraft.LineItems = append(order.InvoiceDraft.LineItems, item)
		}
		if err := sqliteStore.PutWorkOrder(ctx, order); err != nil {
			t.Fatalf("put work order: %v", err)
		}
	}

	// Rows stored before empty due dates were normalized away keep "" in
	// both the column and the payload.
	if _, err := rawDB.ExecContext(ctx, `UPDATE work_orders
		SET due_date = '', payload = json_set(payload, '$.dueDate', ''),
		    summary_payload = json_set(summary_payload, '$.dueDate', '')
		WHERE id IN (SELECT id FROM work_orders WHERE tenant_id = ? AND due_date IS NULL ORDER BY id LIMIT 15)`,
		store.DemoTenantID); err != nil {
		t.Fatalf("store legacy empty due dates: %v", err)
	}

	// Another organization's orders must never leak into this one's dashboard.
	if err := sqliteStore.EnsureTenant(context.Background(), "tenant-other", "other", "Other"); err != nil {
		t.Fatalf("ensure other tenant: %v", err)
	}
	otherCtx := store.ContextWithTenant(context.Background(), "tenant-other")
	if err := sqliteStore.PutWorkOrder(otherCtx, domain.WorkOrder{
		ID: "dash-other", OrderNumber: "RN-2026-9999", ClientName: "Other", IssuedBy: "admin",
		IssueDate: "2026-06-01", Status: domain.WorkOrderStatusNew,
	}); err != nil {
		t.Fatalf("put other tenant order: %v", err)
	}

	// The pruning must actually prune, or the equivalence below proves nothing.
	pruned, err := sqliteStore.DashboardOrders(ctx, store.DashboardOrdersQuery{DateFrom: "2031-01-01", Today: "2026-06-10", Username: "operater"})
	if err != nil {
		t.Fatalf("dashboard orders: %v", err)
	}
	if len(pruned.Orders) == 0 || len(pruned.Orders) >= 240 {
		t.Fatalf("expected a pruned, non-empty attention set, got %d of 240", len(pruned.Orders))
	}

	filterSets := []dashboard.Filters{
		{},
		{DateFrom: "2026-01-01"},
		{DateTo: "2025-12-31"},
		{DateFrom: "2025-06-01", DateTo: "2026-03-31"},
		{IssuedBy: "ivan"},
		{DateFrom: "2026-02-01", DateTo: "2026-02-28", IssuedBy: "operater"},
		{DateFrom: "2031-01-01"}, // matches nothing
		{DateFrom: "2025-01-01", CompanyKey: "cust-1"},
	}
	todays := []string{"2026-06-10", "2026-05-31", "2026-07-25", "2024-01-01", "2030-01-01"}
	usernames := []string{"operater", "admin", "nobody", ""}

	for _, filters := range filterSets {
		for _, today := range todays {
			for _, username := range usernames {
				for _, admin := range []bool{true, false} {
					opts := dashboard.Options{Filters: filters, Today: today, IsAdmin: admin, Username: username}
					want := referenceDashboard(t, ctx, sqliteStore, opts)
					data, err := server.buildDashboard(ctx, opts)
					if err != nil {
						t.Fatalf("buildDashboard: %v", err)
					}
					got, err := json.Marshal(data)
					if err != nil {
						t.Fatalf("marshal dashboard: %v", err)
					}
					if !bytes.Equal(got, want) {
						t.Fatalf("dashboard differs for filters=%+v today=%s user=%q admin=%v\n got: %.600s\nwant: %.600s",
							filters, today, username, admin, got, want)
					}
				}
			}
		}
	}

	// An organization with no orders reports HasOrders=false like before.
	if err := sqliteStore.EnsureTenant(context.Background(), "tenant-empty", "empty", "Empty"); err != nil {
		t.Fatalf("ensure empty tenant: %v", err)
	}
	emptyCtx := store.ContextWithTenant(context.Background(), "tenant-empty")
	opts := dashboard.Options{Today: "2026-06-10", IsAdmin: true}
	want := referenceDashboard(t, emptyCtx, sqliteStore, opts)
	data, err := server.buildDashboard(emptyCtx, opts)
	if err != nil {
		t.Fatalf("buildDashboard empty: %v", err)
	}
	got, _ := json.Marshal(data)
	if !bytes.Equal(got, want) {
		t.Fatalf("empty tenant dashboard differs\n got: %s\nwant: %s", got, want)
	}
}
