package dashboard

import (
	"reflect"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func sp(s string) *string   { return &s }
func fp(f float64) *float64 { return &f }
func method(s string) *domain.DeliveryMethod {
	m := domain.DeliveryMethod(s)
	return &m
}

func makeOrder(mut func(*domain.WorkOrder)) domain.WorkOrder {
	o := domain.WorkOrder{
		ID:             "order-1",
		OrderNumber:    "RN-1",
		ClientName:     "Acme d.o.o.",
		JobDescription: "Test nalog",
		IssuedBy:       "ana",
		Assignment:     domain.Assignment{AssignedTo: sp("marko"), Priority: "normal"},
		IssueDate:      "2026-05-20",
		Status:         domain.WorkOrderStatusAssigned,
		CreatedAt:      "2026-05-20T08:00:00Z",
		UpdatedAt:      "2026-05-20T08:00:00Z",
	}
	if mut != nil {
		mut(&o)
	}
	return o
}

func makeLine(mut func(*domain.InvoiceLineItem)) domain.InvoiceLineItem {
	l := domain.InvoiceLineItem{
		ID:          "li-1",
		Kind:        domain.InvoiceLineItemKindService,
		Description: "Štampa",
		Quantity:    1,
		UnitPrice:   100,
		UnitCost:    fp(40),
	}
	if mut != nil {
		mut(&l)
	}
	return l
}

func withLines(mut func(*domain.WorkOrder), lines ...domain.InvoiceLineItem) domain.WorkOrder {
	return makeOrder(func(o *domain.WorkOrder) {
		if mut != nil {
			mut(o)
		}
		o.InvoiceDraft.LineItems = lines
	})
}

const today = "2026-06-03"

func hasSignal(order domain.WorkOrder, s signal) bool {
	for _, got := range orderSignals(&order, today) {
		if got == s {
			return true
		}
	}
	return false
}

func TestAttentionSignals(t *testing.T) {
	if !hasSignal(makeOrder(func(o *domain.WorkOrder) { o.DueDate = sp("2026-06-02") }), signalOverdue) {
		t.Error("expected overdue")
	}
	if hasSignal(makeOrder(func(o *domain.WorkOrder) { o.DueDate = sp("2026-06-02"); o.IsCompleted = true }), signalOverdue) {
		t.Error("completed order must not be overdue")
	}
	if !hasSignal(makeOrder(func(o *domain.WorkOrder) { o.DueDate = sp("2026-06-03") }), signalDueToday) {
		t.Error("expected dueToday")
	}
	if !hasSignal(makeOrder(func(o *domain.WorkOrder) { o.DueDate = sp("2026-06-09") }), signalDueThisWeek) {
		t.Error("expected dueThisWeek")
	}
	if !hasSignal(makeOrder(func(o *domain.WorkOrder) { o.Assignment.AssignedTo = nil }), signalUnassigned) {
		t.Error("expected unassigned")
	}
}

func TestDueThisWeekBoundaries(t *testing.T) {
	cases := map[string]bool{
		"2026-06-02": false, // yesterday
		"2026-06-03": true,  // today
		"2026-06-10": true,  // today + 7 inclusive
		"2026-06-11": false, // today + 8
	}
	for due, want := range cases {
		o := makeOrder(func(o *domain.WorkOrder) { o.DueDate = sp(due) })
		if got := hasSignal(o, signalDueThisWeek); got != want {
			t.Errorf("due %s dueThisWeek = %v, want %v", due, got, want)
		}
	}
	// The window counts calendar days across a month boundary.
	end := makeOrder(func(o *domain.WorkOrder) { o.DueDate = sp("2026-07-03") })
	if got := orderSignals(&end, "2026-06-26"); !reflect.DeepEqual(got, []signal{signalDueThisWeek, signalUnassigned}[:1]) {
		t.Errorf("signals across month boundary = %v", got)
	}
}

func TestCancelledOrderRaisesNoSignal(t *testing.T) {
	cancelled := makeOrder(func(o *domain.WorkOrder) {
		o.DueDate = sp("2026-06-02")
		o.Status = domain.WorkOrderStatusCancelled
		o.Assignment.AssignedTo = nil
	})
	if got := orderSignals(&cancelled, today); len(got) != 0 {
		t.Fatalf("signals = %v, want none", got)
	}
	counts := BuildSignalCounts([]domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ID = "open"; o.DueDate = sp("2026-06-02") }),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID = "cancelled"
			o.DueDate = sp("2026-06-02")
			o.Status = domain.WorkOrderStatusCancelled
		}),
	}, today)
	if counts.Overdue != 1 {
		t.Fatalf("overdue = %d, want 1", counts.Overdue)
	}
}

func TestAttentionRowsGroupByCustomerThenNormalizedName(t *testing.T) {
	orders := []domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.OrderNumber = "1", "RN-1"
			o.CustomerID = sp("customer-1")
			o.ClientName = "Acme Stari naziv"
			o.DueDate = sp("2026-06-02")
			o.UpdatedAt = "2026-06-01T08:00:00Z"
		}),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.OrderNumber = "2", "RN-2"
			o.CustomerID = sp("customer-1")
			o.ClientName = "Acme Novi naziv"
			o.DueDate = sp("2026-06-03")
			o.UpdatedAt = "2026-06-02T08:00:00Z"
		}),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.OrderNumber = "3", "RN-3"
			o.ClientName = "  LEGACY client  "
			o.DueDate = sp("2026-06-08")
		}),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.OrderNumber = "4", "RN-4"
			o.ClientName = "legacy CLIENT"
			o.DueDate = sp("2026-06-09")
			o.UpdatedAt = "2026-06-02T08:00:00Z"
		}),
	}
	rows := BuildAttentionRows(orders, coreSignals, today, newCollator())
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	first := rows[0]
	if first.GroupKey != "customer-1" || first.CustomerID == nil || *first.CustomerID != "customer-1" ||
		first.DisplayName != "Acme Novi naziv" || first.Counts.Overdue != 1 || first.Counts.DueToday != 1 {
		t.Fatalf("unexpected first row: %+v", first)
	}
	var numbers []string
	for _, o := range first.Orders {
		numbers = append(numbers, o.OrderNumber)
	}
	if !reflect.DeepEqual(numbers, []string{"RN-1", "RN-2"}) {
		t.Fatalf("order numbers = %v", numbers)
	}

	legacy := rows[1]
	if legacy.GroupKey != "legacy client" || legacy.CustomerID != nil ||
		legacy.DisplayName != "legacy CLIENT" || legacy.Counts.DueThisWeek != 2 {
		t.Fatalf("unexpected legacy row: %+v", legacy)
	}
	// customer-1: 600 + (1+1+1... overdue, dueToday, dueThisWeek(RN-2)) = 600 + 3/100
	if first.Severity != 600.03 {
		t.Fatalf("severity = %v, want 600.03", first.Severity)
	}
}

func TestAttentionRowSortTieBreaks(t *testing.T) {
	// Same severity and totals; ordered by collated display name (case-insensitive primary order).
	mk := func(id, name string) domain.WorkOrder {
		return makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.OrderNumber, o.ClientName = id, "RN-"+id, name
			o.DueDate = sp("2026-06-02")
		})
	}
	rows := BuildAttentionRows(
		[]domain.WorkOrder{mk("1", "dunav"), mk("2", "Beta"), mk("3", "alfa")},
		coreSignals, today, newCollator(),
	)
	var names []string
	for _, r := range rows {
		names = append(names, r.DisplayName)
	}
	if !reflect.DeepEqual(names, []string{"alfa", "Beta", "dunav"}) {
		t.Fatalf("names = %v", names)
	}

	// Higher total signals beats name when severity is equal; severity also
	// includes the total, so a row with more signals sorts first.
	a := makeOrder(func(o *domain.WorkOrder) { o.ID, o.ClientName, o.DueDate = "a", "Zeta", sp("2026-06-02") })
	b1 := makeOrder(func(o *domain.WorkOrder) { o.ID, o.ClientName, o.DueDate = "b1", "Alfa", sp("2026-06-02") })
	b2 := makeOrder(func(o *domain.WorkOrder) { o.ID, o.ClientName, o.DueDate = "b2", "Alfa", sp("2026-06-02") })
	rows = BuildAttentionRows([]domain.WorkOrder{a, b1, b2}, coreSignals, today, newCollator())
	if rows[0].DisplayName != "Alfa" {
		t.Fatalf("first = %s, want Alfa (more signals)", rows[0].DisplayName)
	}
}

func TestAttentionOrdersSortBySeverityThenOrderNumber(t *testing.T) {
	orders := []domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.OrderNumber, o.DueDate = "a", "RN-B", sp("2026-06-05") }),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.OrderNumber, o.DueDate = "b", "RN-C", sp("2026-06-01") }),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.OrderNumber, o.DueDate = "c", "RN-A", sp("2026-06-05") }),
	}
	rows := BuildAttentionRows(orders, coreSignals, today, newCollator())
	var ids []string
	for _, o := range rows[0].Orders {
		ids = append(ids, o.ID)
	}
	if !reflect.DeepEqual(ids, []string{"b", "c", "a"}) {
		t.Fatalf("ids = %v, want overdue first then RN-A, RN-B", ids)
	}
}

func TestInternalAttentionRowsOnlyUnassigned(t *testing.T) {
	data := Build([]domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ID = "1"; o.Assignment.AssignedTo = nil }),
		makeOrder(func(o *domain.WorkOrder) { o.ID = "2"; o.DueDate = sp("2026-06-02") }),
	}, Options{Today: today})
	if len(data.InternalAttentionRows) != 1 || data.InternalAttentionRows[0].Counts.Unassigned != 1 {
		t.Fatalf("internal rows = %+v", data.InternalAttentionRows)
	}
	if len(data.ClientAttentionRows) != 1 || data.ClientAttentionRows[0].Counts.Overdue != 1 {
		t.Fatalf("client rows = %+v", data.ClientAttentionRows)
	}
	if data.SignalCounts.Overdue != 1 || data.SignalCounts.Unassigned != 1 {
		t.Fatalf("signal counts = %+v", data.SignalCounts)
	}
}

func TestNormalizeClientGroupName(t *testing.T) {
	if got := NormalizeClientGroupName("  Acme   D.O.O.  "); got != "acme d.o.o." {
		t.Fatalf("got %q", got)
	}
}

func TestFilterWorkOrders(t *testing.T) {
	orders := []domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.IssueDate, o.IssuedBy = "a", "2026-05-01", "ana" }),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.IssueDate, o.IssuedBy = "b", "2026-05-15", "ana" }),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.IssueDate, o.IssuedBy = "c", "2026-05-31", "ivan" }),
	}
	ids := func(list []domain.WorkOrder) []string {
		out := []string{}
		for _, o := range list {
			out = append(out, o.ID)
		}
		return out
	}
	if got := ids(FilterWorkOrders(orders, Filters{})); len(got) != 3 {
		t.Errorf("no filter = %v", got)
	}
	if got := ids(FilterWorkOrders(orders, Filters{DateFrom: "2026-05-15", DateTo: "2026-05-31"})); !reflect.DeepEqual(got, []string{"b", "c"}) {
		t.Errorf("inclusive range = %v", got)
	}
	if got := ids(FilterWorkOrders(orders, Filters{IssuedBy: "ivan"})); !reflect.DeepEqual(got, []string{"c"}) {
		t.Errorf("issuedBy = %v", got)
	}
}

func TestDeriveSummaryAndBuckets(t *testing.T) {
	orders := []domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.IssueDate, o.Price = "a", "2026-05-02", fp(100.5) }),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.IssueDate, o.Status = "b", "2026-04-02", domain.WorkOrderStatusCompleted
		}),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.IssueDate, o.Price = "c", "2026-05-20", fp(50) }),
	}
	summary := DeriveSummary(orders)
	if summary.TotalOrders != 3 || summary.TotalRevenue != 150.5 {
		t.Fatalf("summary = %+v", summary)
	}
	if len(summary.StatusCounts) != 6 {
		t.Fatalf("status keys = %d, want 6", len(summary.StatusCounts))
	}
	if summary.StatusCounts[domain.WorkOrderStatusAssigned] != 2 ||
		summary.StatusCounts[domain.WorkOrderStatusCompleted] != 1 ||
		summary.StatusCounts[domain.WorkOrderStatusNew] != 0 {
		t.Fatalf("status counts = %+v", summary.StatusCounts)
	}

	buckets := MonthlyBuckets(orders)
	want := []domain.DashboardMonthlyBucket{
		{Month: "2026-04", Count: 1, Revenue: 0},
		{Month: "2026-05", Count: 2, Revenue: 150.5},
	}
	if !reflect.DeepEqual(buckets, want) {
		t.Fatalf("buckets = %+v", buckets)
	}
}

func TestDeliveryDistributionAndTopClients(t *testing.T) {
	orders := []domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ClientName = "B"; o.Shipping.DeliveryMethod = method("pickup") }),
		makeOrder(func(o *domain.WorkOrder) { o.ClientName = "A"; o.Shipping.DeliveryMethod = method("postExpress") }),
		makeOrder(func(o *domain.WorkOrder) { o.ClientName = "A"; o.Shipping.DeliveryMethod = method("postExpress") }),
		makeOrder(func(o *domain.WorkOrder) { o.ClientName = "C" }), // no method
	}
	dist := DeliveryDistribution(orders)
	wantDist := []domain.DashboardDeliveryCount{{Method: "postExpress", Count: 2}, {Method: "pickup", Count: 1}}
	if !reflect.DeepEqual(dist, wantDist) {
		t.Fatalf("distribution = %+v", dist)
	}
	top := TopClients(orders, 10, newCollator())
	wantTop := []domain.DashboardClientCount{{ClientName: "A", Count: 2}, {ClientName: "B", Count: 1}, {ClientName: "C", Count: 1}}
	if !reflect.DeepEqual(top, wantTop) {
		t.Fatalf("top = %+v", top)
	}
	if got := TopClients(orders, 2, newCollator()); len(got) != 2 {
		t.Fatalf("top 2 = %+v", got)
	}
}

func TestQueueSummaryAndOperatorQueue(t *testing.T) {
	orders := []domain.WorkOrder{
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.DueDate = "mine-today", sp(today) }),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.DueDate, o.Status = "mine-overdue", sp("2026-06-01"), domain.WorkOrderStatusInProgress
		}),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.DueDate, o.IsCompleted, o.Status = "mine-done", sp("2026-06-01"), true, domain.WorkOrderStatusCompleted
		}),
		makeOrder(func(o *domain.WorkOrder) {
			o.ID, o.DueDate, o.Status = "mine-cancelled", sp("2026-06-01"), domain.WorkOrderStatusCancelled
		}),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.Assignment.AssignedTo = "free", nil }),
		makeOrder(func(o *domain.WorkOrder) { o.ID, o.Assignment.AssignedTo, o.DueDate = "other", sp("ivan"), sp(today) }),
	}
	op := BuildOperatorQueue(orders, today, "marko")
	want := domain.DashboardOperatorQueue{AssignedToMe: 2, DueToday: 1, Overdue: 1, InProgress: 1, Available: 1}
	if op != want {
		t.Fatalf("operator queue = %+v, want %+v", op, want)
	}

	q := BuildQueueSummary(orders, today)
	// Cancelled dropped. today: mine-today + other = 2. overdue: mine-overdue only
	// (mine-done is completed). unassigned: free = 1.
	wantQ := domain.DashboardQueueSummary{Today: 2, Overdue: 1, Unassigned: 1}
	if q != wantQ {
		t.Fatalf("queue summary = %+v, want %+v", q, wantQ)
	}
}

func TestProfitByKind(t *testing.T) {
	orders := []domain.WorkOrder{withLines(nil,
		makeLine(func(l *domain.InvoiceLineItem) { l.UnitPrice, l.UnitCost, l.Quantity = 300, fp(120), 2 }),
		makeLine(func(l *domain.InvoiceLineItem) {
			l.ID, l.Kind, l.UnitPrice, l.UnitCost, l.Quantity = "li-2", domain.InvoiceLineItemKindGoods, 620, fp(400), 1
		}),
	)}
	got := ProfitByKind(orders)
	if got != (domain.DashboardProfitTotals{Service: 360, Article: 220, Total: 580}) {
		t.Fatalf("profit = %+v", got)
	}
	if rev := TotalRevenue(orders); rev != 300*2+620 {
		t.Fatalf("revenue = %v", rev)
	}
}

func TestMissingUnitCostIsZero(t *testing.T) {
	orders := []domain.WorkOrder{withLines(nil, makeLine(func(l *domain.InvoiceLineItem) { l.UnitCost = nil }))}
	if got := ProfitByKind(orders).Total; got != 100 {
		t.Fatalf("total = %v, want 100", got)
	}
}

func TestMonthlyProfit(t *testing.T) {
	orders := []domain.WorkOrder{
		withLines(func(o *domain.WorkOrder) { o.ID, o.IssueDate = "a", "2026-04-10" }, makeLine(nil)),
		withLines(func(o *domain.WorkOrder) { o.ID, o.IssueDate = "b", "2026-05-02" },
			makeLine(func(l *domain.InvoiceLineItem) {
				l.Kind, l.UnitPrice, l.UnitCost = domain.InvoiceLineItemKindGoods, 200, fp(50)
			})),
		withLines(func(o *domain.WorkOrder) { o.ID, o.IssueDate = "c", "2026-05-15" }),
	}
	got := MonthlyProfit(orders)
	want := []domain.DashboardMonthlyProfit{
		{Month: "2026-04", Service: 60, Total: 60},
		{Month: "2026-05", Article: 150, Total: 150},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("monthly profit = %+v", got)
	}
}

func TestProfitByCompany(t *testing.T) {
	orders := []domain.WorkOrder{
		withLines(func(o *domain.WorkOrder) { o.ID, o.CustomerID, o.ClientName = "a", sp("c1"), "Alpha" },
			makeLine(nil)), // 60
		withLines(func(o *domain.WorkOrder) {
			o.ID, o.CustomerID, o.ClientName, o.UpdatedAt = "b", sp("c1"), "Alpha", "2026-06-01T00:00:00Z"
		}, makeLine(func(l *domain.InvoiceLineItem) { l.UnitPrice, l.UnitCost = 200, fp(50) })), // 150
		withLines(func(o *domain.WorkOrder) { o.ID, o.CustomerID, o.ClientName = "c", sp("c2"), "Beta" },
			makeLine(func(l *domain.InvoiceLineItem) { l.UnitPrice, l.UnitCost = 1000, fp(100) })), // 900
	}
	got := ProfitByCompany(orders, newCollator())
	if len(got) != 2 {
		t.Fatalf("rows = %d", len(got))
	}
	if got[0].Name != "Beta" || got[0].Profit != 900 || got[0].OrderCount != 1 || *got[0].CustomerID != "c2" {
		t.Fatalf("first = %+v", got[0])
	}
	if got[1].Name != "Alpha" || got[1].Profit != 210 || got[1].OrderCount != 2 ||
		got[1].ServiceProfit != 210 || got[1].Revenue != 300 {
		t.Fatalf("second = %+v", got[1])
	}
}

func TestProfitByCompanyNormalizedNameFallbackAndTieBreak(t *testing.T) {
	orders := []domain.WorkOrder{
		withLines(func(o *domain.WorkOrder) { o.ClientName = "Gamma  DOO" }, makeLine(nil)),
		withLines(func(o *domain.WorkOrder) { o.ClientName = "gamma doo" }, makeLine(nil)),
	}
	got := ProfitByCompany(orders, newCollator())
	if len(got) != 1 || got[0].GroupKey != "gamma doo" {
		t.Fatalf("rows = %+v", got)
	}

	// Equal profit falls back to collated name.
	tie := []domain.WorkOrder{
		withLines(func(o *domain.WorkOrder) { o.ClientName = "Dunav" }, makeLine(nil)),
		withLines(func(o *domain.WorkOrder) { o.ClientName = "Beta" }, makeLine(nil)),
	}
	rows := ProfitByCompany(tie, newCollator())
	if rows[0].Name != "Beta" || rows[1].Name != "Dunav" {
		t.Fatalf("tie order = %s, %s", rows[0].Name, rows[1].Name)
	}
}

func TestProfitByItemCatalogGrouping(t *testing.T) {
	orders := []domain.WorkOrder{
		withLines(func(o *domain.WorkOrder) { o.ID = "a" },
			makeLine(func(l *domain.InvoiceLineItem) { l.ID, l.CatalogItemID, l.Quantity = "l1", sp("svc-1"), 2 }),
			makeLine(func(l *domain.InvoiceLineItem) {
				l.ID, l.Kind, l.CatalogItemID, l.Description = "l2", domain.InvoiceLineItemKindGoods, sp("art-1"), "Papir"
				l.UnitPrice, l.UnitCost = 200, fp(150)
			})),
		withLines(func(o *domain.WorkOrder) { o.ID = "b" },
			makeLine(func(l *domain.InvoiceLineItem) { l.ID, l.CatalogItemID = "l3", sp("svc-1") }),
			makeLine(func(l *domain.InvoiceLineItem) {
				l.ID, l.Kind, l.CatalogItemID, l.Description = "l4", domain.InvoiceLineItemKindGoods, sp("art-2"), "Koverte"
				l.UnitPrice, l.UnitCost = 500, fp(100)
			})),
	}
	got := ProfitByItem(orders, newCollator())
	if len(got.Services) != 1 {
		t.Fatalf("services = %+v", got.Services)
	}
	svc := got.Services[0]
	if *svc.CatalogItemID != "svc-1" || svc.Name != "Štampa" || svc.Profit != 180 || svc.Quantity != 3 {
		t.Fatalf("service = %+v", svc)
	}
	if len(got.Articles) != 2 || *got.Articles[0].CatalogItemID != "art-2" || *got.Articles[1].CatalogItemID != "art-1" {
		t.Fatalf("articles = %+v", got.Articles)
	}
	if got.Articles[0].Name != "Koverte" || got.Articles[0].Profit != 400 || got.Articles[0].Revenue != 500 {
		t.Fatalf("top article = %+v", got.Articles[0])
	}
	if got.Articles[0].GroupKey != "goods:art-2" {
		t.Fatalf("group key = %q", got.Articles[0].GroupKey)
	}
}

func TestProfitByItemAdHocAndTieBreak(t *testing.T) {
	orders := []domain.WorkOrder{withLines(nil,
		makeLine(func(l *domain.InvoiceLineItem) {
			l.ID, l.Description, l.UnitPrice, l.UnitCost = "l1", "Sečenje", 100, fp(0)
		}),
		makeLine(func(l *domain.InvoiceLineItem) {
			l.ID, l.Description, l.UnitPrice, l.UnitCost = "l2", "sečenje", 100, fp(0)
		}),
	)}
	got := ProfitByItem(orders, newCollator())
	if len(got.Services) != 1 || got.Services[0].CatalogItemID != nil || got.Services[0].Profit != 200 {
		t.Fatalf("ad-hoc = %+v", got.Services)
	}
	if got.Services[0].GroupKey != "service:desc:sečenje" {
		t.Fatalf("group key = %q", got.Services[0].GroupKey)
	}

	blank := []domain.WorkOrder{withLines(nil,
		makeLine(func(l *domain.InvoiceLineItem) { l.Description = "   " }),
	)}
	if name := ProfitByItem(blank, newCollator()).Services[0].Name; name != "—" {
		t.Fatalf("blank name = %q", name)
	}

	tie := []domain.WorkOrder{withLines(nil,
		makeLine(func(l *domain.InvoiceLineItem) { l.ID, l.Description = "l1", "Dunav" }),
		makeLine(func(l *domain.InvoiceLineItem) { l.ID, l.Description = "l2", "Beta" }),
	)}
	rows := ProfitByItem(tie, newCollator()).Services
	if rows[0].Name != "Beta" {
		t.Fatalf("tie order = %s, %s", rows[0].Name, rows[1].Name)
	}
}

func TestBuildFinanceAdminOnlyAndCompanyScope(t *testing.T) {
	orders := []domain.WorkOrder{
		withLines(func(o *domain.WorkOrder) { o.ID, o.CustomerID, o.ClientName = "a", sp("c1"), "Alpha" },
			makeLine(func(l *domain.InvoiceLineItem) { l.CatalogItemID = sp("svc-a") })),
		withLines(func(o *domain.WorkOrder) { o.ID, o.CustomerID, o.ClientName = "b", sp("c2"), "Beta" },
			makeLine(func(l *domain.InvoiceLineItem) { l.CatalogItemID = sp("svc-b") })),
	}

	operator := Build(orders, Options{Today: today, Username: "marko"})
	if operator.Finance != nil {
		t.Fatal("finance must be nil for non-admins")
	}

	admin := Build(orders, Options{Today: today, IsAdmin: true})
	if admin.Finance == nil || len(admin.Finance.CompanyProfit) != 2 || len(admin.Finance.ItemProfit.Services) != 2 {
		t.Fatalf("admin finance = %+v", admin.Finance)
	}

	scoped := Build(orders, Options{Today: today, IsAdmin: true, Filters: Filters{CompanyKey: "c2"}})
	// companyKey scopes only the item breakdown.
	if len(scoped.Finance.CompanyProfit) != 2 || scoped.Finance.ProfitTotals.Total != 120 {
		t.Fatalf("scoped finance must keep all companies: %+v", scoped.Finance)
	}
	if len(scoped.Finance.ItemProfit.Services) != 1 || *scoped.Finance.ItemProfit.Services[0].CatalogItemID != "svc-b" {
		t.Fatalf("scoped items = %+v", scoped.Finance.ItemProfit)
	}
	if scoped.Summary.TotalOrders != 2 {
		t.Fatalf("companyKey must not filter the summary, got %d", scoped.Summary.TotalOrders)
	}
}

func TestBuildEmptyYieldsNonNilSlices(t *testing.T) {
	data := Build(nil, Options{Today: today, IsAdmin: true})
	if data.MonthlyBuckets == nil || data.DeliveryDistribution == nil || data.TopClients == nil ||
		data.ClientAttentionRows == nil || data.InternalAttentionRows == nil ||
		data.Finance.MonthlyProfit == nil || data.Finance.CompanyProfit == nil ||
		data.Finance.ItemProfit.Services == nil || data.Finance.ItemProfit.Articles == nil {
		t.Fatalf("expected empty non-nil slices: %+v", data)
	}
	if data.HasOrders {
		t.Fatal("expected hasOrders=false for no orders")
	}
}

func TestBuildHasOrdersIgnoresFilters(t *testing.T) {
	orders := []domain.WorkOrder{makeOrder(func(o *domain.WorkOrder) { o.IssueDate = "2026-01-10" })}
	data := Build(orders, Options{Today: today, Filters: Filters{DateFrom: "2027-01-01"}})
	if !data.HasOrders || data.Summary.TotalOrders != 0 {
		t.Fatalf("expected hasOrders with zero filtered orders, got %+v", data.Summary)
	}
}

func TestCollatorMatchesSerbianLatinAlphabet(t *testing.T) {
	c := newCollator()
	ordered := []string{"Ana", "Cer", "Čačak", "Ćuprija", "Dan", "Đakovo", "Sava", "Šabac", "Zemun", "Žabalj"}
	for i := 1; i < len(ordered); i++ {
		if c.CompareString(ordered[i-1], ordered[i]) >= 0 {
			t.Errorf("expected %q to sort before %q", ordered[i-1], ordered[i])
		}
	}
}
