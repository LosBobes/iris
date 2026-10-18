package store

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// demoFixtureDir is the fixture set seed-demo loads, relative to this package.
const demoFixtureDir = "../../testdata/fixtures"

func openDemoStore(t *testing.T) (*SQLiteStore, context.Context) {
	t.Helper()
	ctx := context.Background()
	s, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, ctx
}

// seededProcesses returns the work orders that carry a process (the content
// orders), separately from the plain fixture orders that do not.
func seededProcesses(t *testing.T, s *SQLiteStore, tctx context.Context) []domain.WorkOrder {
	t.Helper()
	orders, err := s.WorkOrders(tctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	var withProcess []domain.WorkOrder
	for _, order := range orders.Items {
		process, err := s.WorkOrderProcess(tctx, order.ID)
		if err != nil {
			t.Fatalf("order %s process = %v", order.OrderNumber, err)
		}
		if process != nil {
			withProcess = append(withProcess, order)
		}
	}
	return withProcess
}

func TestSeedDemoFromFixtures(t *testing.T) {
	s, ctx := openDemoStore(t)

	result, err := SeedDemoFromFixtures(ctx, s, demoFixtureDir, "", "", "")
	if err != nil || result.AlreadySeeded {
		t.Fatalf("SeedDemoFromFixtures = %+v, %v", result, err)
	}
	tenant, err := s.TenantBySlug(ctx, DemoTenantSlug)
	if err != nil || tenant == nil || tenant.Name != DemoTenantName {
		t.Fatalf("tenant = %+v, %v", tenant, err)
	}
	tctx := ContextWithTenant(ctx, tenant.ID)

	// Both modules are on for the merged org.
	if modules, err := s.OrganizationModules(tctx); err != nil || !modules.Stock || !modules.Processes {
		t.Fatalf("modules = %+v, %v", modules, err)
	}
	// The fixture admin login and the content operator login both work.
	for _, creds := range [][2]string{{"admin", "admin123"}, {demoOperatorUsername, demoOperatorPassword}} {
		if user, err := s.AuthenticateUser(ctx, tenant.ID, creds[0], creds[1]); err != nil || user == nil {
			t.Fatalf("login %s = %v, %v", creds[0], user, err)
		}
	}

	templates, err := s.ProcessTemplates(tctx)
	if err != nil || len(templates) != 4 || result.Templates != 4 {
		t.Fatalf("templates = %d, %v", len(templates), err)
	}
	defaults := 0
	for _, template := range templates {
		if template.IsDefault {
			defaults++
			if template.Name != "Offset štampa" {
				t.Fatalf("default template = %q", template.Name)
			}
		}
	}
	if defaults != 1 {
		t.Fatalf("default templates = %d", defaults)
	}

	// The fixture orders (no process) and the 8 content orders (with a process)
	// coexist in one tenant. Validate the content orders by their processes.
	all, err := s.WorkOrders(tctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	withProcess := seededProcesses(t, s, tctx)
	if len(withProcess) != 8 || result.Orders != 8 {
		t.Fatalf("process orders = %d (total %d), result.Orders = %d", len(withProcess), all.Total, result.Orders)
	}
	if all.Total <= 8 {
		t.Fatalf("expected fixture orders alongside the 8 content orders, total = %d", all.Total)
	}
	statuses := map[domain.WorkOrderStatus]int{}
	byNumber := map[string]domain.WorkOrder{}
	for _, order := range withProcess {
		statuses[order.Status]++
		byNumber[order.OrderNumber] = order
	}
	if statuses[domain.WorkOrderStatusNew] != 2 || statuses[domain.WorkOrderStatusInProgress] != 2 ||
		statuses[domain.WorkOrderStatusCompleted] != 2 || statuses[domain.WorkOrderStatusCancelled] != 1 ||
		statuses[domain.WorkOrderStatusAssigned] != 1 {
		t.Fatalf("content statuses = %v", statuses)
	}

	// Stock: LOW and healthy articles, all movement kinds.
	levels, err := s.StockLevels(tctx, StockLevelQuery{})
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]domain.StockLevel{}
	low, healthy := 0, 0
	for _, level := range levels.Items {
		byName[level.Name] = level
		if level.Low {
			low++
		} else if level.MinStock != nil {
			healthy++
		}
	}
	if low == 0 || healthy == 0 || len(result.LowArticles) != low {
		t.Fatalf("low=%d healthy=%d result=%v", low, healthy, result.LowArticles)
	}
	if toner := byName["Toner"]; !toner.Low || toner.MinStock == nil || toner.Available >= *toner.MinStock {
		t.Fatalf("toner = %+v", toner)
	}
	if plates := byName["Offset ploča"]; plates.Low {
		t.Fatalf("plates should have a buffer: %+v", plates)
	}
	movements, err := s.StockMovements(tctx, StockMovementQuery{})
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[domain.StockMovementKind]int{}
	refs := 0
	for _, movement := range movements.Items {
		kinds[movement.Kind]++
		if movement.Kind == domain.StockMovementReceipt && movement.DocumentRef != nil {
			refs++
		}
	}
	for _, kind := range []domain.StockMovementKind{
		domain.StockMovementOpening, domain.StockMovementReceipt, domain.StockMovementConsumption, domain.StockMovementProduction,
	} {
		if kinds[kind] == 0 {
			t.Fatalf("no %s movements: %v", kind, kinds)
		}
	}
	if refs == 0 {
		t.Fatal("receipts carry no document reference")
	}

	// Shortage: the big open order plans more paper than is on hand.
	shortage, ok := byNumber[result.ShortageOrder]
	if !ok || shortage.Status != domain.WorkOrderStatusAssigned {
		t.Fatalf("shortage order %q = %+v", result.ShortageOrder, shortage)
	}
	process, _ := s.WorkOrderProcess(tctx, shortage.ID)
	planned := domain.ReservedInputs(process.Graph)
	paper := byName["Papir 80g A3"]
	if need := planned[paper.CatalogItemID]; need != 8000 || need <= paper.OnHand || paper.Available >= 0 {
		t.Fatalf("planned %v vs on hand %v / available %v", need, paper.OnHand, paper.Available)
	}

	// Reserved stock counts open orders only: recompute and compare. Fixture
	// orders have no process and contribute nothing.
	wantReserved := map[string]float64{}
	for _, order := range withProcess {
		p, _ := s.WorkOrderProcess(tctx, order.ID)
		if p == nil || order.Status == domain.WorkOrderStatusCancelled || order.Status == domain.WorkOrderStatusCompleted {
			continue
		}
		for id, qty := range domain.ReservedInputs(p.Graph) {
			wantReserved[id] += qty
		}
	}
	cancelled := byNumber[result.CancelledOrder]
	if cancelled.Status != domain.WorkOrderStatusCancelled {
		t.Fatalf("cancelled order = %+v", cancelled)
	}
	cp, _ := s.WorkOrderProcess(tctx, cancelled.ID)
	if len(domain.ReservedInputs(cp.Graph)) == 0 {
		t.Fatal("cancelled order plans no inputs; the check would be vacuous")
	}
	for _, level := range levels.Items {
		if !near(level.Reserved, wantReserved[level.CatalogItemID]) {
			t.Fatalf("%s reserved = %v, want %v (open orders only)", level.Name, level.Reserved, wantReserved[level.CatalogItemID])
		}
	}
	kd := byName["Papir kunstdruk 135g SRA3"]
	if !near(kd.Reserved, 40) { // only the new digital order; the cancelled 400 is excluded
		t.Fatalf("kunstdruk reserved = %v", kd.Reserved)
	}

	// In-progress order records an actual quantity above plan.
	inProgress := byNumber[result.InProgressOrder]
	ip, _ := s.WorkOrderProcess(tctx, inProgress.ID)
	over := false
	for _, node := range ip.Graph.Nodes {
		if node.ActualQuantity != nil && node.Quantity != nil && *node.ActualQuantity > *node.Quantity {
			over = true
		}
	}
	if !over {
		t.Fatal("no node with actual above planned quantity")
	}

	// A second run re-runs the (idempotent) fixture half but leaves the process
	// and stock content untouched.
	beforeMovements := movements.Total
	beforeOrders := all.Total
	again, err := SeedDemoFromFixtures(ctx, s, demoFixtureDir, "", "", "")
	if err != nil || !again.AlreadySeeded {
		t.Fatalf("second run = %+v, %v", again, err)
	}
	if after, _ := s.StockMovements(tctx, StockMovementQuery{}); after.Total != beforeMovements {
		t.Fatalf("movements changed on re-run: %d -> %d", beforeMovements, after.Total)
	}
	if o, _ := s.WorkOrders(tctx, WorkOrderListQuery{}); o.Total != beforeOrders {
		t.Fatalf("orders changed on re-run: %d -> %d", beforeOrders, o.Total)
	}
	if templates, _ := s.ProcessTemplates(tctx); len(templates) != 4 {
		t.Fatalf("templates changed on re-run = %d", len(templates))
	}
}

func TestDemoPasswords(t *testing.T) {
	// Outside production both overrides pass through untouched (empty = keep the
	// public demo passwords).
	if admin, operator, err := DemoPasswords(false, "", ""); err != nil || admin != "" || operator != "" {
		t.Fatalf("non-production empty = %q %q %v", admin, operator, err)
	}
	for name, pw := range map[string][2]string{
		"missing admin":    {"", "operater-strong-pass"},
		"missing operator": {"admin-strong-pass", ""},
		"short":            {"short", "operater-strong-pass"},
		"demo admin":       {"admin123", "operater-strong-pass"},
		"demo op":          {"admin-strong-pass", "operater123"},
		"backoffice demo":  {"admin123321", "operater-strong-pass"},
	} {
		if _, _, err := DemoPasswords(true, pw[0], pw[1]); err == nil {
			t.Errorf("%s: production accepted %q / %q", name, pw[0], pw[1])
		}
	}
	admin, operator, err := DemoPasswords(true, " admin-strong-pass ", "operater-strong-pass")
	if err != nil || admin != "admin-strong-pass" || operator != "operater-strong-pass" {
		t.Fatalf("production passwords = %q %q %v", admin, operator, err)
	}
}

func TestSeedDemoWithProductionPasswords(t *testing.T) {
	s, ctx := openDemoStore(t)
	if _, err := SeedDemoFromFixtures(ctx, s, demoFixtureDir, "admin-strong-pass", "operater-strong-pass", ""); err != nil {
		t.Fatal(err)
	}
	tenant, _ := s.TenantBySlug(ctx, DemoTenantSlug)
	// The demo admin/admin123 login that the production startup guard rejects
	// must not exist anywhere.
	if demo, err := s.HasUserPassword(ctx, "admin", "admin123"); err != nil || demo {
		t.Fatalf("HasUserPassword(admin, admin123) = %v, %v", demo, err)
	}
	// Admin and both operator logins authenticate with the strong passwords.
	for _, creds := range [][2]string{
		{"admin", "admin-strong-pass"},
		{demoOperatorUsername, "operater-strong-pass"},
		{"ana.jovic", "operater-strong-pass"}, // a fixture operator, overridden too
	} {
		if user, err := s.AuthenticateUser(ctx, tenant.ID, creds[0], creds[1]); err != nil || user == nil {
			t.Fatalf("login %s = %v, %v", creds[0], user, err)
		}
	}
	// The public operator password no longer works for any login.
	if user, err := s.AuthenticateUser(ctx, tenant.ID, demoOperatorUsername, "operater123"); err == nil && user != nil {
		t.Fatal("demo operator password still works")
	}
}

func TestSeedDemoIDPrefixAvoidsCollision(t *testing.T) {
	s, ctx := openDemoStore(t)
	// Another tenant already owns a record with a fixture id (as the real
	// Čobanović data owns cust-2). Without a prefix the demo seed collides.
	if err := s.EnsureTenant(ctx, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	octx := ContextWithTenant(ctx, "tenant-other")
	if _, err := s.UpsertCustomer(octx, domain.Customer{ID: "cust-2", Name: "Pre-existing"}); err != nil {
		t.Fatal(err)
	}
	// Unprefixed seed must fail on the colliding id.
	if _, err := SeedDemoFromFixtures(ctx, s, demoFixtureDir, "", "", ""); err == nil {
		t.Fatal("expected a collision without an id prefix")
	}

	// A fresh store, prefixed, coexists with the other tenant's cust-2.
	s2, ctx2 := openDemoStore(t)
	if err := s2.EnsureTenant(ctx2, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	if _, err := s2.UpsertCustomer(ContextWithTenant(ctx2, "tenant-other"), domain.Customer{ID: "cust-2", Name: "Pre-existing"}); err != nil {
		t.Fatal(err)
	}
	if _, err := SeedDemoFromFixtures(ctx2, s2, demoFixtureDir, "", "", "demo-"); err != nil {
		t.Fatalf("prefixed seed failed: %v", err)
	}
	demo := ContextWithTenant(ctx2, DemoTenantID)
	// The demo customer carries the prefixed id; the other tenant's record is intact.
	if c, err := s2.CustomerByID(demo, "demo-cust-2"); err != nil || c == nil {
		t.Fatalf("demo-cust-2 = %v, %v", c, err)
	}
	if c, err := s2.CustomerByID(ContextWithTenant(ctx2, "tenant-other"), "cust-2"); err != nil || c == nil || c.Name != "Pre-existing" {
		t.Fatalf("other tenant cust-2 changed: %v, %v", c, err)
	}
	// The bare fixture id was namespaced away in the demo tenant (the content
	// half keeps its own cust-demo-* ids, which is a different namespace).
	if c, err := s2.CustomerByID(demo, "cust-2"); err != nil || c != nil {
		t.Fatalf("unprefixed cust-2 present in demo tenant: %v, %v", c, err)
	}
	// No demo work order references an unprefixed fixture customer id.
	orders, err := s2.WorkOrders(demo, WorkOrderListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range orders.Items {
		if o.CustomerID != nil && strings.HasPrefix(*o.CustomerID, "cust-") && !strings.HasPrefix(*o.CustomerID, "cust-demo-") {
			t.Fatalf("work order %s references unprefixed fixture customer: %q", o.OrderNumber, *o.CustomerID)
		}
	}
}

// TestDeleteTenantCascades checks that deleting a tenant leaves no row behind in
// any table that carries tenant data, including child tables without a tenant_id.
func TestDeleteTenantCascades(t *testing.T) {
	s, ctx := openDemoStore(t)
	if _, err := SeedDemoFromFixtures(ctx, s, demoFixtureDir, "", "", ""); err != nil {
		t.Fatal(err)
	}
	tenant, _ := s.TenantBySlug(ctx, DemoTenantSlug)
	user, err := s.AuthenticateUser(ctx, tenant.ID, "admin", "admin123")
	if err != nil || user == nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, user.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if deleted, err := s.DeleteTenant(ctx, DemoTenantSlug); err != nil || !deleted {
		t.Fatalf("DeleteTenant = %v, %v", deleted, err)
	}
	if deleted, err := s.DeleteTenant(ctx, DemoTenantSlug); err != nil || deleted {
		t.Fatalf("second DeleteTenant = %v, %v", deleted, err)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('tenants', 'schema_migrations')`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	rows.Close()
	// Tables with a tenant_id must hold nothing for the deleted tenant; child
	// tables without one (sessions, locations, history, ...) must be empty. The
	// platform-level tables are not tenant data.
	skip := map[string]bool{"platform_admins": true, "platform_sessions": true, "platform_audit_events": true}
	for _, table := range tables {
		if skip[table] {
			continue
		}
		hasTenant := false
		cols, err := s.db.QueryContext(ctx, `SELECT name FROM pragma_table_info('`+table+`')`)
		if err != nil {
			t.Fatal(err)
		}
		for cols.Next() {
			var name string
			if err := cols.Scan(&name); err != nil {
				t.Fatal(err)
			}
			hasTenant = hasTenant || name == "tenant_id"
		}
		cols.Close()
		query, args := `SELECT COUNT(*) FROM "`+table+`"`, []any{}
		if hasTenant {
			query, args = query+` WHERE tenant_id = ?`, []any{tenant.ID}
		}
		var count int
		if err := s.db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Errorf("table %s still has %d rows after tenant delete", table, count)
		}
	}
}
