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

// demoTemplateCount is how many process templates the content half creates.
const demoTemplateCount = 5

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

	// All four modules are on for the demo org.
	if modules, err := s.OrganizationModules(tctx); err != nil || !modules.Stock || !modules.Processes || !modules.Planning || !modules.Attendance {
		t.Fatalf("modules = %+v, %v", modules, err)
	}
	// The fixture admin login and the content operator login both work.
	for _, creds := range [][2]string{{"admin", "admin123"}, {demoOperatorUsername, demoOperatorPassword}} {
		if user, err := s.AuthenticateUser(ctx, tenant.ID, creds[0], creds[1]); err != nil || user == nil {
			t.Fatalf("login %s = %v, %v", creds[0], user, err)
		}
	}

	checkDemoSettings(t, s, tctx)
	checkDemoCustomersAndCatalog(t, s, tctx)

	templates, err := s.ProcessTemplates(tctx)
	if err != nil || len(templates) != demoTemplateCount || result.Templates != demoTemplateCount {
		t.Fatalf("templates = %d, %v", len(templates), err)
	}
	defaults, starts, finals := 0, 0, 0
	for _, template := range templates {
		if template.IsDefault {
			defaults++
			if template.Name != "Offset štampa" {
				t.Fatalf("default template = %q", template.Name)
			}
		}
		for _, node := range template.Graph.Nodes {
			if node.Start {
				starts++
			}
			if node.Final {
				finals++
			}
		}
	}
	if defaults != 1 {
		t.Fatalf("default templates = %d", defaults)
	}
	if starts < demoTemplateCount || finals < demoTemplateCount {
		t.Fatalf("start/final flags = %d/%d, every template should carry them", starts, finals)
	}

	// The history orders (no process, written directly) and the live orders
	// (with a process) coexist in one tenant; the fixture work orders are not
	// loaded. Validate the live orders by their processes.
	all, err := s.WorkOrders(tctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	withProcess := seededProcesses(t, s, tctx)
	history := len(demoHistoryOrders())
	if len(withProcess) != result.Orders || result.Orders != len((&demoContentBuilder{}).liveOrderSpecs()) {
		t.Fatalf("process orders = %d, result.Orders = %d", len(withProcess), result.Orders)
	}
	if all.Total != history+result.Orders || result.HistoryOrders != history {
		t.Fatalf("orders = %d, want %d history + %d live", all.Total, history, result.Orders)
	}
	statuses := map[domain.WorkOrderStatus]int{}
	byNumber := map[string]domain.WorkOrder{}
	for _, order := range withProcess {
		statuses[order.Status]++
		byNumber[order.OrderNumber] = order
	}
	if statuses[domain.WorkOrderStatusNew] != 3 || statuses[domain.WorkOrderStatusAssigned] != 4 ||
		statuses[domain.WorkOrderStatusInProgress] != 4 || statuses[domain.WorkOrderStatusCompleted] != 1 ||
		statuses[domain.WorkOrderStatusInvoiced] != 1 || statuses[domain.WorkOrderStatusCancelled] != 1 {
		t.Fatalf("live statuses = %v", statuses)
	}
	checkDemoHistory(t, s, tctx, history)
	checkDemoLiveOrders(t, s, tctx, result, byNumber)

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
		domain.StockMovementOpening, domain.StockMovementReceipt, domain.StockMovementConsumption,
		domain.StockMovementProduction, domain.StockMovementAdjustment,
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

	// Reserved stock counts open orders only: recompute and compare. History
	// orders have no process and contribute nothing.
	wantReserved := map[string]float64{}
	for _, order := range withProcess {
		p, _ := s.WorkOrderProcess(tctx, order.ID)
		if p == nil || order.Status == domain.WorkOrderStatusCancelled || order.Status == domain.WorkOrderStatusCompleted || order.Status == domain.WorkOrderStatusInvoiced {
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

	checkDemoAttendance(t, s, tctx, result)
	checkDemoPlanning(t, s, tctx, result, withProcess)
	checkDemoPlatform(t, s, ctx, tenant)

	// A second run re-runs the (idempotent) fixture half but leaves the content
	// untouched.
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
	if templates, _ := s.ProcessTemplates(tctx); len(templates) != demoTemplateCount {
		t.Fatalf("templates changed on re-run = %d", len(templates))
	}
	if machines, _ := s.Machines(tctx); len(machines) != result.Machines {
		t.Fatalf("machines changed on re-run = %d, want %d", len(machines), result.Machines)
	}
	if announcements, _ := s.ActiveAnnouncements(tctx, time.Now()); len(announcements) != 1 {
		t.Fatalf("announcements changed on re-run = %d", len(announcements))
	}
}

// checkDemoSettings verifies the organization settings, custom picklist values
// and the sign-in logo.
func checkDemoSettings(t *testing.T, s *SQLiteStore, tctx context.Context) {
	t.Helper()
	settings, err := s.OrganizationSettings(tctx)
	if err != nil || settings.FirmName != demoFirmName || !settings.ShowShippingOptions ||
		!settings.PriorityDefaults.AllowOverride || settings.BillingDefaults.DocumentType != domain.BillingDocumentTypeInvoice {
		t.Fatalf("settings = %+v, %v", settings, err)
	}
	values, err := s.EnumValues(tctx)
	if err != nil {
		t.Fatal(err)
	}
	custom := map[string]bool{}
	for _, value := range values {
		if !value.IsBuiltin {
			custom[string(value.Field)+"/"+value.Value] = true
		}
	}
	for _, want := range []string{"deliveryMethod/" + demoDeliveryCourier, "invoiceUnit/" + demoUnitSheet, "postagePaymentType/mesecni"} {
		if !custom[want] {
			t.Fatalf("custom enum %s missing in %v", want, custom)
		}
	}
	if logo, err := s.LoginLogo(tctx); err != nil || logo == nil || logo.ContentType != "image/png" || len(logo.Data) == 0 {
		t.Fatalf("login logo = %+v, %v", logo, err)
	}
}

// checkDemoCustomersAndCatalog verifies the content customers carry
// identifiers, contacts and several locations, and that the catalog has a
// scheduled price change, cleanup candidates and an inactive article.
func checkDemoCustomersAndCatalog(t *testing.T, s *SQLiteStore, tctx context.Context) {
	t.Helper()
	customers, err := s.Customers(tctx, CustomerQuery{})
	if err != nil {
		t.Fatal(err)
	}
	withPIB, withContacts, withEmails := 0, 0, 0
	for _, customer := range customers.Items {
		if customer.Pib != nil && *customer.Pib != "" {
			withPIB++
		}
		if len(customer.Contacts) > 0 {
			withContacts++
		}
		if len(customer.Emails) > 0 {
			withEmails++
		}
	}
	if withPIB != len(demoCustomers) || withContacts == 0 || withEmails == 0 {
		t.Fatalf("customers: %d with PIB (want %d), %d with contacts, %d with e-mails", withPIB, len(demoCustomers), withContacts, withEmails)
	}
	pekara, err := s.CustomerByID(tctx, "cust-"+DemoTenantSlug+"-pekara")
	if err != nil || pekara == nil {
		t.Fatalf("pekara = %v, %v", pekara, err)
	}
	if locations, err := s.Locations(tctx, pekara.ID); err != nil || len(locations) != 2 {
		t.Fatalf("pekara locations = %d, %v", len(locations), err)
	}

	items, err := s.CatalogItems(tctx, CatalogItemQuery{})
	if err != nil {
		t.Fatal(err)
	}
	inactive := 0
	for _, item := range items.Items {
		if !item.IsActive {
			inactive++
		}
	}
	if inactive == 0 {
		t.Fatal("no inactive catalog item")
	}
	missing, err := s.CatalogItemsMissingPrices(tctx, CatalogCleanupFilter{Kinds: []domain.CatalogItemKind{domain.CatalogItemKindArticle, domain.CatalogItemKindService}, Missing: CleanupMissingPurchase})
	if err != nil || len(missing) < 2 {
		t.Fatalf("cleanup candidates = %d, %v", len(missing), err)
	}
	history, err := s.CatalogItemCostHistory(tctx, "cat-"+DemoTenantSlug+"-kunstdruk")
	if err != nil || len(history) != 2 {
		t.Fatalf("kunstdruk cost history = %+v, %v", history, err)
	}
}

// checkDemoHistory verifies the past year's orders: dated over twelve months,
// finished, with invoice lines that carry a frozen cost.
func checkDemoHistory(t *testing.T, s *SQLiteStore, tctx context.Context, count int) {
	t.Helper()
	orders, err := s.WorkOrders(tctx, WorkOrderListQuery{Status: domain.WorkOrderStatusInvoiced, Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	months := map[string]bool{}
	paid, costed := 0, 0
	for _, order := range orders.Items {
		if !strings.HasPrefix(order.ID, "demo-h-") {
			continue
		}
		months[order.IssueDate[:7]] = true
		if order.IsPaid {
			paid++
		}
		full, err := s.WorkOrderByID(tctx, order.ID)
		if err != nil {
			t.Fatal(err)
		}
		if full.InvoiceDraft.InvoiceNumber == nil || len(full.InvoiceDraft.LineItems) == 0 || len(full.TimeEntries) == 0 || len(full.StatusHistory) < 5 {
			t.Fatalf("history order %s is thin: %+v", order.OrderNumber, full.InvoiceDraft)
		}
		for _, line := range full.InvoiceDraft.LineItems {
			if line.UnitCost != nil && line.CatalogItemID != nil {
				costed++
			}
		}
	}
	if len(months) < 10 || paid == 0 || costed == 0 {
		t.Fatalf("history: %d months, %d paid, %d costed lines", len(months), paid, costed)
	}
	if orders.Total < count-6 {
		t.Fatalf("invoiced history orders = %d of %d", orders.Total, count)
	}
}

// checkDemoLiveOrders verifies the orders the CLI summary points at.
func checkDemoLiveOrders(t *testing.T, s *SQLiteStore, tctx context.Context, result DemoSeedResult, byNumber map[string]domain.WorkOrder) {
	t.Helper()
	today := time.Now().Format("2006-01-02")
	get := func(number, what string) *domain.WorkOrder {
		t.Helper()
		order, ok := byNumber[number]
		if !ok {
			t.Fatalf("%s order %q not among the live orders", what, number)
		}
		full, err := s.WorkOrderByID(tctx, order.ID)
		if err != nil || full == nil {
			t.Fatalf("%s order %s = %v, %v", what, number, full, err)
		}
		return full
	}
	if o := get(result.CostReviewOrder, "cost review"); !o.NeedsCostReview || o.Assignment.AssignedTo != nil {
		t.Fatalf("cost review order = needsCostReview %v, assignee %v", o.NeedsCostReview, o.Assignment.AssignedTo)
	}
	if o := get(result.OverdueOrder, "overdue"); o.DueDate == nil || *o.DueDate >= today || o.Assignment.Priority != domain.WorkOrderPriorityUrgent || len(o.InternalNotes) == 0 || len(o.Attachments) == 0 {
		t.Fatalf("overdue order = %+v", o)
	}
	if o := get(result.DueTodayOrder, "due today"); o.DueDate == nil || *o.DueDate != today {
		t.Fatalf("due today order due %v", o.DueDate)
	}
	if o := get(result.SignedOrder, "signed"); o.Communication.SignedBy == nil || len(o.CustomerNotes) == 0 || o.Status != domain.WorkOrderStatusCompleted {
		t.Fatalf("signed order = %+v", o.Communication)
	}
	if o := get(result.InvoicedOrder, "invoiced"); o.Status != domain.WorkOrderStatusInvoiced || !o.IsPaid || o.InvoiceDraft.Status != domain.InvoiceDraftStatusPaid || o.InvoiceDraft.InvoiceNumber == nil {
		t.Fatalf("invoiced order = %s %v %+v", o.Status, o.IsPaid, o.InvoiceDraft)
	}
	skipped := get(result.SkippedStepOrder, "skipped step")
	sp, _ := s.WorkOrderProcess(tctx, skipped.ID)
	hasSkipped := false
	for _, node := range sp.Graph.Nodes {
		hasSkipped = hasSkipped || node.Status == domain.ProcessStepSkipped
	}
	if !hasSkipped {
		t.Fatal("no skipped step on the skipped-step order")
	}
	// A step in progress, a proforma deadline, every shipping option and the
	// unassigned order each exist somewhere among the live orders.
	inProgressStep, proforma, shippingOptions := false, false, false
	for _, order := range byNumber {
		full, _ := s.WorkOrderByID(tctx, order.ID)
		proforma = proforma || full.ProformaDueDate != nil
		shippingOptions = shippingOptions || (full.Shipping.IsFragile && full.Shipping.HasInsurance && full.Shipping.ShippingAddress != nil)
		p, _ := s.WorkOrderProcess(tctx, order.ID)
		for _, node := range p.Graph.Nodes {
			inProgressStep = inProgressStep || node.Status == domain.ProcessStepInProgress
		}
		// Backdated: created on the issue morning, not at seed time.
		if full.CreatedAt[:10] != full.IssueDate && full.CreatedAt > full.UpdatedAt {
			t.Fatalf("order %s created %s / updated %s, issued %s", full.OrderNumber, full.CreatedAt, full.UpdatedAt, full.IssueDate)
		}
	}
	if !inProgressStep || !proforma || !shippingOptions {
		t.Fatalf("live orders: in-progress step %v, proforma %v, shipping options %v", inProgressStep, proforma, shippingOptions)
	}
}

// checkDemoAttendance verifies the sign-in history and the overrides.
func checkDemoAttendance(t *testing.T, s *SQLiteStore, tctx context.Context, result DemoSeedResult) {
	t.Helper()
	entries, err := s.Attendance(tctx, "")
	if err != nil {
		t.Fatal(err)
	}
	signedIn, overrides := 0, 0
	for _, entry := range entries {
		if entry.SignedIn {
			signedIn++
		}
		if entry.Override != nil {
			overrides++
		}
	}
	if signedIn == 0 && overrides == 0 {
		t.Fatalf("attendance today = %+v", entries)
	}
	if len(result.PublishedPlanDates) == 0 {
		t.Fatal("no published plan date")
	}
	next, err := s.Attendance(tctx, result.PublishedPlanDates[len(result.PublishedPlanDates)-1])
	if err != nil {
		t.Fatal(err)
	}
	absent := false
	for _, entry := range next {
		absent = absent || (entry.Override != nil && !*entry.Override)
	}
	if !absent {
		t.Fatalf("nobody on leave on the next working day: %+v", next)
	}
}

// checkDemoPlatform verifies the welcome announcement and the organization notes.
func checkDemoPlatform(t *testing.T, s *SQLiteStore, ctx context.Context, tenant *domain.Tenant) {
	t.Helper()
	active, err := s.ActiveAnnouncements(ContextWithTenant(ctx, tenant.ID), time.Now())
	if err != nil || len(active) != 1 || active[0].Severity != domain.AnnouncementInfo {
		t.Fatalf("announcements = %+v, %v", active, err)
	}
	tenants, err := s.PlatformTenants(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range tenants {
		if row.Slug == DemoTenantSlug {
			if row.Notes.Plan != "Demo" || row.Health.LastLoginAt == nil || row.Health.Dormant {
				t.Fatalf("demo tenant card = notes %+v, health %+v", row.Notes, row.Health)
			}
			return
		}
	}
	t.Fatal("demo tenant not listed")
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
	skip := map[string]bool{"platform_admins": true, "platform_sessions": true, "platform_audit_events": true,
		"platform_announcements": true, // platform rows; only their tenant targets are tenant data (D-024)
		"work_order_id_counter":  true} // global id sequence, not tenant data
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

// checkDemoPlanning verifies the planning content: machines, qualifications,
// timed steps on templates and order copies, and that a plan for the next
// working day (everyone counts as present) books machines and people.
func checkDemoPlanning(t *testing.T, s *SQLiteStore, tctx context.Context, result DemoSeedResult, withProcess []domain.WorkOrder) {
	t.Helper()
	types, err := s.MachineTypes(tctx)
	if err != nil || len(types) != len(demoMachineTypes) || result.MachineTypes != len(types) {
		t.Fatalf("machine types = %d (result %d), %v", len(types), result.MachineTypes, err)
	}
	machines, err := s.Machines(tctx)
	if err != nil || len(machines) != 10 || result.Machines != 10 {
		t.Fatalf("machines = %d (result %d), %v", len(machines), result.Machines, err)
	}
	outOfService := 0
	for _, machine := range machines {
		if !machine.InService {
			outOfService++
		}
	}
	if outOfService != 1 {
		t.Fatalf("machines out of service = %d", outOfService)
	}
	// A published plan exists for every date the result names and a draft for
	// the day after; "Moj red" of the operater has work on a published day.
	for _, date := range result.PublishedPlanDates {
		day, err := s.PlanDay(tctx, date, true)
		if err != nil || day.Published == nil || len(day.Published.Assignments) == 0 {
			t.Fatalf("plan %s = %+v, %v", date, day, err)
		}
	}
	if day, err := s.PlanDay(tctx, result.DraftPlanDate, true); err != nil || day.Draft == nil || day.Published != nil {
		t.Fatalf("draft plan %s = %+v, %v", result.DraftPlanDate, day, err)
	}
	workers, err := s.Qualifications(tctx)
	if err != nil {
		t.Fatal(err)
	}
	qualified := map[string]int{}
	for _, worker := range workers {
		qualified[worker.Username] = len(worker.MachineTypeIDs)
	}
	for username, keys := range demoQualifications {
		if qualified[username] != len(keys) {
			t.Fatalf("%s qualifications = %d, want %d", username, qualified[username], len(keys))
		}
	}
	templates, err := s.ProcessTemplates(tctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, template := range templates {
		for _, node := range template.Graph.Nodes {
			if _, ok := domain.StepDurationMinutes(node, 1); node.Kind == domain.ProcessNodeStep && !ok {
				t.Fatalf("template %s step %s has no duration", template.Name, node.ID)
			}
		}
	}
	timedCopies := 0
	for _, order := range withProcess {
		process, _ := s.WorkOrderProcess(tctx, order.ID)
		for _, node := range process.Graph.Nodes {
			if node.Kind == domain.ProcessNodeStep && node.MachineTypeID != "" {
				timedCopies++
				break
			}
		}
	}
	if timedCopies != len(withProcess) {
		t.Fatalf("orders whose process carries machine types = %d of %d", timedCopies, len(withProcess))
	}

	// The seed's published plans keep several machines and people busy.
	blocks := 0
	usedMachines, usedPeople := map[string]bool{}, map[string]bool{}
	for _, date := range result.PublishedPlanDates {
		day, err := s.PlanDay(tctx, date, true)
		if err != nil || day.Published == nil {
			t.Fatalf("published plan %s = %+v, %v", date, day, err)
		}
		for _, assignment := range day.Published.Assignments {
			blocks++
			if assignment.MachineID != nil {
				usedMachines[*assignment.MachineID] = true
			}
			for _, user := range assignment.UserIDs {
				usedPeople[user] = true
			}
		}
	}
	if blocks < 5 || len(usedMachines) < 3 || len(usedPeople) < 3 {
		t.Fatalf("demo published plans: %d blocks, %d machines, %d people", blocks, len(usedMachines), len(usedPeople))
	}

	// Plan the next working day after a fixed Monday morning. The draft keeps
	// its whole horizon (D-028) and, when the seed published a plan for the day
	// before, that day's open steps are pinned rather than planned again.
	location, err := time.LoadLocation(domain.DefaultPlanningTimeZone)
	if err != nil {
		t.Fatal(err)
	}
	s.SetClock(func() time.Time { return time.Date(2026, 10, 19, 6, 0, 0, 0, location) })
	t.Cleanup(func() { s.SetClock(nil) })
	plan, err := s.GeneratePlan(tctx, domain.PlanGenerateInput{Date: "2026-10-20"}, demoAdminUsername)
	if err != nil {
		t.Fatalf("GeneratePlan = %v", err)
	}
	horizon, err := s.PlanHorizon(tctx, "2026-10-20")
	if err != nil || horizon.Draft == nil || horizon.Draft.PlanID != plan.ID || horizon.Draft.HorizonEnd <= "2026-10-20" {
		t.Fatalf("PlanHorizon = %+v, %v", horizon, err)
	}
	for _, issue := range plan.Issues {
		if issue.Code != domain.PlanIssueNoCapacity {
			t.Fatalf("unexpected demo plan issue %+v", issue)
		}
	}
}
