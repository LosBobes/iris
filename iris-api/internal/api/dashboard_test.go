package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func dashStrPtr(s string) *string { return &s }
func dashFloatPtr(f float64) *float64 {
	return &f
}

// dashboardFixture seeds the demo tenant with three orders (two companies with
// priced catalog lines, one unassigned order without lines) and a second tenant
// with its own admin and order.
type dashboardFixture struct {
	server     *Server
	adminToken string
	userToken  string
	otherAdmin string
}

func newDashboardFixture(t *testing.T) dashboardFixture {
	t.Helper()
	server, adminToken, userToken := newServerWithRoles(t)
	sqliteStore, ok := server.store.(*store.SQLiteStore)
	if !ok {
		t.Fatalf("server store is %T, want *store.SQLiteStore", server.store)
	}
	ctx := store.ContextWithTenant(context.Background(), store.DemoTenantID)

	catalog, err := sqliteStore.UpsertCatalogItem(ctx, domain.CatalogItem{
		ID: "cat-print", Code: "cat-print", Name: "Štampa", Kind: domain.CatalogItemKindService,
		Unit: "kom", PurchasePrice: dashFloatPtr(100), SalePrice: dashFloatPtr(250), IsActive: true,
	}, "")
	if err != nil {
		t.Fatalf("upsert catalog: %v", err)
	}

	line := func(id string, qty float64) domain.InvoiceLineItem {
		return domain.InvoiceLineItem{
			ID: id, Kind: domain.InvoiceLineItemKindService, Description: "Štampa",
			Quantity: qty, Unit: "kom", UnitPrice: 250, CatalogItemID: &catalog.ID,
		}
	}
	create := func(input domain.CreateWorkOrderInput) {
		t.Helper()
		if _, err := sqliteStore.CreateWorkOrder(ctx, input); err != nil {
			t.Fatalf("create work order %q: %v", input.JobDescription, err)
		}
	}

	// Alpha: margin (250-100)*2 = 300, revenue 500, assigned to the operator.
	create(domain.CreateWorkOrderInput{
		ClientName: "Alpha", JobDescription: "Alpha posao", IssuedBy: "admin",
		IssueDate: "2026-05-10", DueDate: dashStrPtr("2026-06-01"), Price: dashFloatPtr(500),
		Assignment:   domain.Assignment{AssignedTo: dashStrPtr("operater"), Priority: "normal"},
		InvoiceDraft: domain.InvoiceDraft{Status: domain.InvoiceDraftStatusDraft, LineItems: []domain.InvoiceLineItem{line("a1", 2)}},
	})
	// Beta: margin 150, revenue 250.
	create(domain.CreateWorkOrderInput{
		ClientName: "Beta", JobDescription: "Beta posao", IssuedBy: "ivan",
		IssueDate: "2026-06-01", DueDate: dashStrPtr("2026-06-05"), Price: dashFloatPtr(250),
		Assignment:   domain.Assignment{AssignedTo: dashStrPtr("admin"), Priority: "normal"},
		InvoiceDraft: domain.InvoiceDraft{Status: domain.InvoiceDraftStatusDraft, LineItems: []domain.InvoiceLineItem{line("b1", 1)}},
	})
	// Gamma: unassigned, no lines.
	create(domain.CreateWorkOrderInput{
		ClientName: "Gamma", JobDescription: "Gamma posao", IssuedBy: "admin",
		IssueDate: "2026-06-02", Assignment: domain.Assignment{Priority: "normal"},
	})

	// Second tenant with one order of its own.
	if err := sqliteStore.EnsureTenant(context.Background(), "tenant-other", "other", "Other Org"); err != nil {
		t.Fatalf("ensure other tenant: %v", err)
	}
	otherCtx := store.ContextWithTenant(context.Background(), "tenant-other")
	if err := sqliteStore.CreateUser(otherCtx, "other-admin", "otheradmin", "other123", domain.RoleAdmin, false); err != nil {
		t.Fatalf("create other admin: %v", err)
	}
	if _, err := sqliteStore.CreateWorkOrder(otherCtx, domain.CreateWorkOrderInput{
		ClientName: "Foreign", JobDescription: "Foreign posao", IssuedBy: "otheradmin",
		IssueDate: "2026-06-02", Assignment: domain.Assignment{Priority: "normal"},
	}); err != nil {
		t.Fatalf("create other order: %v", err)
	}
	user, err := sqliteStore.AuthenticateUser(context.Background(), "tenant-other", "otheradmin", "other123")
	if err != nil || user == nil {
		t.Fatalf("authenticate other admin: %v", err)
	}
	otherToken, err := sqliteStore.CreateSession(context.Background(), user.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("create other session: %v", err)
	}

	return dashboardFixture{server: server, adminToken: adminToken, userToken: userToken, otherAdmin: otherToken}
}

func getDashboard(t *testing.T, f dashboardFixture, token, query string) (domain.DashboardData, string) {
	t.Helper()
	rec := roleRequest(t, f.server, token, http.MethodGet, "/dashboard"+query, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /dashboard%s = %d: %s", query, rec.Code, rec.Body.String())
	}
	var data domain.DashboardData
	if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	return data, rec.Body.String()
}

func TestDashboardRequiresAuth(t *testing.T) {
	f := newDashboardFixture(t)
	if rec := roleRequest(t, f.server, "", http.MethodGet, "/dashboard", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d, want 401", rec.Code)
	}
}

func TestDashboardAdminGetsFinanceOperatorDoesNot(t *testing.T) {
	f := newDashboardFixture(t)

	admin, _ := getDashboard(t, f, f.adminToken, "?today=2026-06-03")
	if admin.Summary.TotalOrders != 3 || admin.Summary.TotalRevenue != 750 {
		t.Fatalf("admin summary = %+v", admin.Summary)
	}
	if admin.Finance == nil {
		t.Fatal("admin finance is nil")
	}
	if admin.Finance.ProfitTotals.Total != 450 || admin.Finance.ProfitTotals.Service != 450 || admin.Finance.Revenue != 750 {
		t.Fatalf("finance totals = %+v revenue=%v", admin.Finance.ProfitTotals, admin.Finance.Revenue)
	}
	if len(admin.Finance.CompanyProfit) != 3 || admin.Finance.CompanyProfit[0].Name != "Alpha" ||
		admin.Finance.CompanyProfit[0].Profit != 300 {
		t.Fatalf("company profit = %+v", admin.Finance.CompanyProfit)
	}

	operator, raw := getDashboard(t, f, f.userToken, "?today=2026-06-03")
	if operator.Finance != nil {
		t.Fatalf("operator finance = %+v, want nil", operator.Finance)
	}
	var generic map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &generic); err != nil {
		t.Fatal(err)
	}
	if string(generic["finance"]) != "null" {
		t.Fatalf("operator finance JSON = %s, want null", generic["finance"])
	}
	for _, leaked := range []string{"profit", "Profit", "unitCost"} {
		if strings.Contains(raw, leaked) {
			t.Fatalf("operator response leaks %q: %s", leaked, raw)
		}
	}
	// Non-cost aggregates are identical for both roles.
	if operator.Summary.TotalOrders != 3 || operator.Summary.TotalRevenue != 750 {
		t.Fatalf("operator summary = %+v", operator.Summary)
	}
}

func TestDashboardFiltersAndCompanyScope(t *testing.T) {
	f := newDashboardFixture(t)

	data, _ := getDashboard(t, f, f.adminToken, "?dateFrom=2026-06-01&dateTo=2026-06-02")
	if data.Summary.TotalOrders != 2 {
		t.Fatalf("date filter total = %d, want 2", data.Summary.TotalOrders)
	}
	if len(data.MonthlyBuckets) != 1 || data.MonthlyBuckets[0].Month != "2026-06" {
		t.Fatalf("buckets = %+v", data.MonthlyBuckets)
	}

	data, _ = getDashboard(t, f, f.adminToken, "?issuedBy=ivan")
	if data.Summary.TotalOrders != 1 || len(data.TopClients) != 1 || data.TopClients[0].ClientName != "Beta" {
		t.Fatalf("issuedBy filter = %+v / %+v", data.Summary, data.TopClients)
	}
	// Signals and queues ignore the filters (all orders).
	if data.SignalCounts.Unassigned != 1 {
		t.Fatalf("signal counts must be unfiltered: %+v", data.SignalCounts)
	}

	data, _ = getDashboard(t, f, f.adminToken, "?companyKey=beta")
	if data.Summary.TotalOrders != 3 || len(data.Finance.CompanyProfit) != 3 || data.Finance.ProfitTotals.Total != 450 {
		t.Fatalf("companyKey must only scope the item breakdown: %+v", data.Finance)
	}
	if len(data.Finance.ItemProfit.Services) != 1 || data.Finance.ItemProfit.Services[0].Profit != 150 ||
		data.Finance.ItemProfit.Services[0].Quantity != 1 {
		t.Fatalf("scoped items = %+v", data.Finance.ItemProfit.Services)
	}

	data, _ = getDashboard(t, f, f.adminToken, "")
	if len(data.Finance.ItemProfit.Services) != 1 || data.Finance.ItemProfit.Services[0].Profit != 450 {
		t.Fatalf("unscoped items = %+v", data.Finance.ItemProfit.Services)
	}
}

func TestDashboardSignalsQueuesAndToday(t *testing.T) {
	f := newDashboardFixture(t)

	// today 2026-06-01: Alpha is due today; Beta (06-05) is due this week.
	data, _ := getDashboard(t, f, f.userToken, "?today=2026-06-01")
	if data.SignalCounts.DueToday != 1 || data.SignalCounts.DueThisWeek != 2 ||
		data.SignalCounts.Overdue != 0 || data.SignalCounts.Unassigned != 1 {
		t.Fatalf("signals = %+v", data.SignalCounts)
	}
	if data.QueueSummary != (domain.DashboardQueueSummary{Today: 1, Overdue: 0, Unassigned: 1}) {
		t.Fatalf("queue summary = %+v", data.QueueSummary)
	}
	// The session user is "operater": one assigned order, due today.
	if data.OperatorQueue.AssignedToMe != 1 || data.OperatorQueue.DueToday != 1 || data.OperatorQueue.Available != 1 {
		t.Fatalf("operator queue = %+v", data.OperatorQueue)
	}
	if len(data.InternalAttentionRows) != 1 || data.InternalAttentionRows[0].DisplayName != "Gamma" {
		t.Fatalf("internal rows = %+v", data.InternalAttentionRows)
	}
	for _, row := range data.ClientAttentionRows {
		for _, order := range row.Orders {
			if order.ID == "" || order.OrderNumber == "" || order.JobDescription == "" {
				t.Fatalf("slim order incomplete: %+v", order)
			}
		}
	}

	// A later client date makes Alpha overdue.
	data, _ = getDashboard(t, f, f.userToken, "?today=2026-06-03")
	if data.SignalCounts.Overdue != 1 || data.OperatorQueue.Overdue != 1 || data.QueueSummary.Overdue != 1 {
		t.Fatalf("overdue signals = %+v queue=%+v op=%+v", data.SignalCounts, data.QueueSummary, data.OperatorQueue)
	}
}

func TestDashboardAttentionOrdersAreSlim(t *testing.T) {
	f := newDashboardFixture(t)
	_, raw := getDashboard(t, f, f.userToken, "?today=2026-06-03")
	var payload struct {
		ClientAttentionRows []struct {
			Orders []map[string]json.RawMessage `json:"orders"`
		} `json:"clientAttentionRows"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.ClientAttentionRows) == 0 {
		t.Fatal("expected attention rows")
	}
	want := []string{"id", "orderNumber", "jobDescription", "status", "dueDate"}
	for _, row := range payload.ClientAttentionRows {
		for _, order := range row.Orders {
			if len(order) != len(want) {
				t.Fatalf("attention order has %d fields, want %v: %v", len(order), want, order)
			}
			for _, key := range want {
				if _, ok := order[key]; !ok {
					t.Fatalf("attention order missing %q", key)
				}
			}
		}
	}
}

func TestDashboardRejectsBadDates(t *testing.T) {
	f := newDashboardFixture(t)
	for _, query := range []string{
		"?dateFrom=2026-13-01", "?dateTo=yesterday", "?today=03.06.2026", "?today=2026-6-3", "?dateFrom=2026-02-30",
	} {
		rec := roleRequest(t, f.server, f.adminToken, http.MethodGet, "/dashboard"+query, "")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("GET /dashboard%s = %d, want 400", query, rec.Code)
		}
	}
}

func TestDashboardIsTenantScoped(t *testing.T) {
	f := newDashboardFixture(t)

	other, raw := getDashboard(t, f, f.otherAdmin, "")
	if other.Summary.TotalOrders != 1 || len(other.TopClients) != 1 || other.TopClients[0].ClientName != "Foreign" {
		t.Fatalf("other tenant summary = %+v clients=%+v", other.Summary, other.TopClients)
	}
	for _, leaked := range []string{"Alpha", "Beta", "Gamma"} {
		if strings.Contains(raw, leaked) {
			t.Fatalf("other tenant sees %q: %s", leaked, raw)
		}
	}
	if other.Finance == nil || other.Finance.ProfitTotals.Total != 0 || other.Finance.Revenue != 0 {
		t.Fatalf("other tenant finance = %+v", other.Finance)
	}

	home, raw := getDashboard(t, f, f.adminToken, "")
	if home.Summary.TotalOrders != 3 || strings.Contains(raw, "Foreign") {
		t.Fatalf("demo tenant leaked foreign data: %s", raw)
	}
}

func TestDashboardEmptyTenantShape(t *testing.T) {
	f := newDashboardFixture(t)
	sqliteStore := f.server.store.(*store.SQLiteStore)
	ctx := context.Background()
	if err := sqliteStore.EnsureTenant(ctx, "tenant-empty", "empty", "Empty Org"); err != nil {
		t.Fatal(err)
	}
	emptyCtx := store.ContextWithTenant(ctx, "tenant-empty")
	if err := sqliteStore.CreateUser(emptyCtx, "empty-admin", "emptyadmin", "empty123", domain.RoleAdmin, false); err != nil {
		t.Fatal(err)
	}
	user, err := sqliteStore.AuthenticateUser(ctx, "tenant-empty", "emptyadmin", "empty123")
	if err != nil || user == nil {
		t.Fatalf("authenticate: %v", err)
	}
	token, err := sqliteStore.CreateSession(ctx, user.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}

	_, raw := getDashboard(t, f, token, "")
	var generic map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &generic); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{
		"monthlyBuckets", "deliveryDistribution", "topClients", "clientAttentionRows", "internalAttentionRows",
	} {
		if string(generic[key]) != "[]" {
			t.Errorf("%s = %s, want []", key, generic[key])
		}
	}
	var summary struct {
		StatusCounts map[string]int `json:"statusCounts"`
	}
	var wrapper struct {
		Summary json.RawMessage `json:"summary"`
	}
	_ = json.Unmarshal([]byte(raw), &wrapper)
	if err := json.Unmarshal(wrapper.Summary, &summary); err != nil {
		t.Fatal(err)
	}
	for _, status := range []string{"new", "assigned", "inProgress", "completed", "invoiced", "cancelled"} {
		if count, ok := summary.StatusCounts[status]; !ok || count != 0 {
			t.Errorf("statusCounts[%s] = %d present=%v, want 0 present", status, count, ok)
		}
	}
}
