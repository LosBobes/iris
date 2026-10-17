package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func openShowcaseStore(t *testing.T) (*SQLiteStore, context.Context) {
	t.Helper()
	ctx := context.Background()
	s, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, ctx
}

func TestSeedShowcase(t *testing.T) {
	s, ctx := openShowcaseStore(t)

	result, err := SeedShowcase(ctx, s, ShowcaseOptions{})
	if err != nil || !result.Created {
		t.Fatalf("SeedShowcase = %+v, %v", result, err)
	}
	tenant, err := s.TenantBySlug(ctx, ShowcaseDefaultSlug)
	if err != nil || tenant == nil || tenant.Name != ShowcaseName {
		t.Fatalf("tenant = %+v, %v", tenant, err)
	}
	tctx := ContextWithTenant(ctx, tenant.ID)

	if modules, err := s.OrganizationModules(tctx); err != nil || !modules.Stock || !modules.Processes {
		t.Fatalf("modules = %+v, %v", modules, err)
	}
	for _, creds := range [][2]string{{ShowcaseAdminUsername, ShowcaseAdminPassword}, {ShowcaseOperatorUsername, ShowcaseOperatorPassword}} {
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

	orders, err := s.WorkOrders(tctx, WorkOrderListQuery{})
	if err != nil || orders.Total != 8 || result.Orders != 8 {
		t.Fatalf("orders = %d, %v", orders.Total, err)
	}
	statuses := map[domain.WorkOrderStatus]int{}
	byNumber := map[string]domain.WorkOrder{}
	for _, order := range orders.Items {
		statuses[order.Status]++
		byNumber[order.OrderNumber] = order
		if process, err := s.WorkOrderProcess(tctx, order.ID); err != nil || process == nil {
			t.Fatalf("order %s process = %v, %v", order.OrderNumber, process, err)
		}
	}
	if statuses[domain.WorkOrderStatusNew] != 2 || statuses[domain.WorkOrderStatusInProgress] != 2 ||
		statuses[domain.WorkOrderStatusCompleted] != 2 || statuses[domain.WorkOrderStatusCancelled] != 1 ||
		statuses[domain.WorkOrderStatusAssigned] != 1 {
		t.Fatalf("statuses = %v", statuses)
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

	// Reserved stock counts open orders only: recompute and compare, and make sure
	// the cancelled order would have changed the number.
	wantReserved := map[string]float64{}
	cancelledReserved := map[string]float64{}
	for _, order := range orders.Items {
		p, _ := s.WorkOrderProcess(tctx, order.ID)
		target := wantReserved
		if order.Status == domain.WorkOrderStatusCancelled || order.Status == domain.WorkOrderStatusCompleted {
			target = cancelledReserved
		}
		for id, qty := range domain.ReservedInputs(p.Graph) {
			target[id] += qty
		}
	}
	cancelled := byNumber[result.CancelledOrder]
	if cancelled.Status != domain.WorkOrderStatusCancelled {
		t.Fatalf("cancelled order = %+v", cancelled)
	}
	cp, _ := s.WorkOrderProcess(tctx, cancelled.ID)
	cancelledOnly := domain.ReservedInputs(cp.Graph)
	if len(cancelledOnly) == 0 {
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

	// A second run is a no-op.
	before := movements.Total
	again, err := SeedShowcase(ctx, s, ShowcaseOptions{})
	if err != nil || again.Created {
		t.Fatalf("second run = %+v, %v", again, err)
	}
	if after, _ := s.StockMovements(tctx, StockMovementQuery{}); after.Total != before {
		t.Fatalf("movements changed on no-op: %d -> %d", before, after.Total)
	}
	if o, _ := s.WorkOrders(tctx, WorkOrderListQuery{}); o.Total != 8 {
		t.Fatalf("orders after no-op = %d", o.Total)
	}

	// -reset recreates the organization from scratch.
	reset, err := SeedShowcase(ctx, s, ShowcaseOptions{Reset: true, Now: time.Now()})
	if err != nil || !reset.Created {
		t.Fatalf("reset = %+v, %v", reset, err)
	}
	if o, _ := s.WorkOrders(tctx, WorkOrderListQuery{}); o.Total != 8 {
		t.Fatalf("orders after reset = %d", o.Total)
	}
	if after, _ := s.StockMovements(tctx, StockMovementQuery{}); after.Total != before {
		t.Fatalf("movements after reset = %d, want %d", after.Total, before)
	}
}

// TestDeleteTenantCascades checks that deleting a tenant leaves no row behind in
// any table that carries tenant data, including child tables without a tenant_id.
func TestDeleteTenantCascades(t *testing.T) {
	s, ctx := openShowcaseStore(t)
	if _, err := SeedShowcase(ctx, s, ShowcaseOptions{}); err != nil {
		t.Fatal(err)
	}
	tenant, _ := s.TenantBySlug(ctx, ShowcaseDefaultSlug)
	user, err := s.AuthenticateUser(ctx, tenant.ID, ShowcaseAdminUsername, ShowcaseAdminPassword)
	if err != nil || user == nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, user.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if deleted, err := s.DeleteTenant(ctx, ShowcaseDefaultSlug); err != nil || !deleted {
		t.Fatalf("DeleteTenant = %v, %v", deleted, err)
	}
	if deleted, err := s.DeleteTenant(ctx, ShowcaseDefaultSlug); err != nil || deleted {
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

func TestShowcasePasswords(t *testing.T) {
	admin, operator, err := ShowcasePasswords(false, "", "")
	if err != nil || admin != ShowcaseAdminPassword || operator != ShowcaseOperatorPassword {
		t.Fatalf("non-production defaults = %q %q %v", admin, operator, err)
	}
	for name, pw := range map[string][2]string{
		"missing":   {"", "operater-strong-pass"},
		"too short": {"short", "operater-strong-pass"},
		"demo":      {"admin123321", "operater-strong-pass"},
		"demo op":   {"admin-strong-pass", ShowcaseOperatorPassword},
	} {
		if _, _, err := ShowcasePasswords(true, pw[0], pw[1]); err == nil {
			t.Errorf("%s: production accepted %q / %q", name, pw[0], pw[1])
		}
	}
	admin, operator, err = ShowcasePasswords(true, " admin-strong-pass ", "operater-strong-pass")
	if err != nil || admin != "admin-strong-pass" || operator != "operater-strong-pass" {
		t.Fatalf("production passwords = %q %q %v", admin, operator, err)
	}
}

func TestSeedShowcaseWithOwnPasswords(t *testing.T) {
	s, ctx := openShowcaseStore(t)
	result, err := SeedShowcase(ctx, s, ShowcaseOptions{AdminPassword: "admin-strong-pass", OperatorPassword: "operater-strong-pass"})
	if err != nil {
		t.Fatal(err)
	}
	if result.DemoPasswords {
		t.Fatal("DemoPasswords = true for custom passwords")
	}
	tenant, err := s.TenantBySlug(ctx, ShowcaseDefaultSlug)
	if err != nil || tenant == nil {
		t.Fatalf("tenant = %v, %v", tenant, err)
	}
	if user, err := s.AuthenticateUser(ctx, tenant.ID, ShowcaseAdminUsername, ShowcaseAdminPassword); err == nil && user != nil {
		t.Fatal("demo admin password still works")
	}
	for _, creds := range [][2]string{{ShowcaseAdminUsername, "admin-strong-pass"}, {ShowcaseOperatorUsername, "operater-strong-pass"}} {
		if user, err := s.AuthenticateUser(ctx, tenant.ID, creds[0], creds[1]); err != nil || user == nil {
			t.Fatalf("login %s = %v, %v", creds[0], user, err)
		}
	}
	// The production startup guard looks for the demo admin password anywhere.
	if demo, err := s.HasUserPassword(ctx, "admin", "admin123"); err != nil || demo {
		t.Fatalf("HasUserPassword(admin, admin123) = %v, %v", demo, err)
	}
}
