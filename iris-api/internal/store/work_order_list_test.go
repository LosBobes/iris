package store

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestFoldSearchText(t *testing.T) {
	cases := map[string]string{
		"Čobanović":       "cobanovic",
		"ŠTAMPA žuto":     "stampa zuto",
		"Đorđe":           "djordje",
		"ćirilica ČĆŠŽĐ":  "cirilica ccszdj",
		"RN-2026-00001 A": "rn-2026-00001 a",
	}
	for input, want := range cases {
		if got := FoldSearchText(input); got != want {
			t.Errorf("FoldSearchText(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestFormatSerbianAmount(t *testing.T) {
	cases := map[float64]string{
		0:           "0",
		5:           "5",
		999:         "999",
		1500:        "1.500",
		12500.5:     "12.500,5",
		1234567.891: "1.234.567,89",
		-1500:       "-1.500",
	}
	for input, want := range cases {
		if got := FormatSerbianAmount(input); got != want {
			t.Errorf("FormatSerbianAmount(%v) = %q, want %q", input, got, want)
		}
	}
}

func TestOrderNumberSortKeyIsNatural(t *testing.T) {
	ordered := []string{"RN-2025-99", "RN-2026-9", "RN-2026-10", "RN-2026-00011"}
	for i := 1; i < len(ordered); i++ {
		if orderNumberSortKey(ordered[i-1]) >= orderNumberSortKey(ordered[i]) {
			t.Fatalf("sort key of %q should precede %q", ordered[i-1], ordered[i])
		}
	}
}

func listTestOrder(id string, mutate func(*domain.WorkOrder)) domain.WorkOrder {
	order := domain.WorkOrder{
		ID:             id,
		OrderNumber:    "RN-2026-" + id,
		ClientName:     "Klijent " + id,
		JobDescription: "Posao " + id,
		IssuedBy:       "admin",
		IssueDate:      "2026-06-01",
		Status:         domain.WorkOrderStatusNew,
		Assignment:     domain.Assignment{Priority: domain.WorkOrderPriorityNormal},
		CreatedAt:      "2026-06-01T08:00:00Z",
		UpdatedAt:      "2026-06-01T08:00:00Z",
	}
	if mutate != nil {
		mutate(&order)
	}
	return order
}

// listTestOrders covers every list filter; the same set is checked against
// the SQLite store and the fixture-store matcher so the two stay twins.
func listTestOrders() []domain.WorkOrder {
	invoice := domain.BillingDocumentTypeInvoice
	proforma := domain.BillingDocumentTypeProforma
	pickup := domain.DeliveryMethodPickup
	price := 12500.5
	return []domain.WorkOrder{
		listTestOrder("1", func(o *domain.WorkOrder) {
			o.ClientName = "Štamparija Čobanović"
			o.BillingDocumentType = &invoice
			o.CustomerID = strPtr("cust-1")
			o.DueDate = strPtr("2026-06-05") // overdue on 2026-06-10
			o.Price = &price
		}),
		listTestOrder("2", func(o *domain.WorkOrder) {
			o.BillingDocumentType = &proforma
			o.Shipping.DeliveryMethod = &pickup
			o.Assignment.AssignedTo = strPtr("ana")
			o.DueDate = strPtr("2026-06-10") // today
		}),
		listTestOrder("10", func(o *domain.WorkOrder) {
			o.DueDate = strPtr("2026-06-15") // this week
			o.Assignment.Priority = domain.WorkOrderPriorityUrgent
		}),
		listTestOrder("11", func(o *domain.WorkOrder) {
			o.Status = domain.WorkOrderStatusCancelled
			o.DueDate = strPtr("2026-06-01")
		}),
		listTestOrder("12", func(o *domain.WorkOrder) {
			o.Status = domain.WorkOrderStatusCompleted
			o.IsCompleted = true
			o.DueDate = strPtr("2026-06-02")
			o.Assignment.AssignedTo = strPtr("marko")
			o.StatusHistory = []domain.WorkOrderStatusHistory{{Status: domain.WorkOrderStatusCompleted, ChangedAt: "2026-06-02"}}
		}),
	}
}

var listFilterCases = []struct {
	name  string
	query WorkOrderListQuery
	want  []string
}{
	{"folded search matches diacritics", WorkOrderListQuery{Search: "cobanovic"}, []string{"1"}},
	{"diacritic search term folds too", WorkOrderListQuery{Search: "ŠTAMPARIJA"}, []string{"1"}},
	{"search by formatted price", WorkOrderListQuery{Search: "12.500,5"}, []string{"1"}},
	{"search by display date", WorkOrderListQuery{Search: "10.06.2026"}, []string{"2"}},
	{"search by priority label", WorkOrderListQuery{Search: "hitno"}, []string{"10"}},
	{"search treats % literally", WorkOrderListQuery{Search: "%"}, nil},
	{"billing document type", WorkOrderListQuery{BillingDocumentType: "proforma"}, []string{"2"}},
	{"delivery method", WorkOrderListQuery{DeliveryMethod: "pickup"}, []string{"2"}},
	{"customer", WorkOrderListQuery{CustomerID: "cust-1"}, []string{"1"}},
	{"queue unassigned", WorkOrderListQuery{Queue: "unassigned", Today: "2026-06-10"}, []string{"1", "10"}},
	{"queue overdue", WorkOrderListQuery{Queue: "overdue", Today: "2026-06-10"}, []string{"1"}},
	{"queue today", WorkOrderListQuery{Queue: "today", Today: "2026-06-10"}, []string{"2"}},
	{"queue this week", WorkOrderListQuery{Queue: "thisWeek", Today: "2026-06-10"}, []string{"2", "10"}},
}

func idsOf(orders []domain.WorkOrder) []string {
	var ids []string
	for _, order := range orders {
		ids = append(ids, order.ID)
	}
	return ids
}

func TestSQLiteWorkOrderListFiltersSortsAndProjects(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	for _, order := range listTestOrders() {
		if err := sqliteStore.PutWorkOrder(ctx, order); err != nil {
			t.Fatalf("PutWorkOrder(%s) returned error: %v", order.ID, err)
		}
	}

	for _, tc := range listFilterCases {
		t.Run(tc.name, func(t *testing.T) {
			query := tc.query
			query.Sort = "dueDate"
			result, err := sqliteStore.WorkOrders(ctx, query)
			if err != nil {
				t.Fatalf("WorkOrders() returned error: %v", err)
			}
			want := tc.want
			if got := idsOf(result.Items); !reflect.DeepEqual(got, want) || result.Total != len(want) {
				t.Fatalf("ids = %v (total %d), want %v", got, result.Total, want)
			}
			fixtureMatches := []string{}
			for _, order := range listTestOrders() {
				if workOrderMatchesListQuery(order, query) {
					fixtureMatches = append(fixtureMatches, order.ID)
				}
			}
			if !sameSet(fixtureMatches, want) {
				t.Fatalf("fixture matcher = %v, want %v", fixtureMatches, want)
			}
		})
	}

	t.Run("order number sorts naturally", func(t *testing.T) {
		result, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{Sort: "-orderNumber"})
		if err != nil {
			t.Fatalf("WorkOrders() returned error: %v", err)
		}
		if got, want := idsOf(result.Items), []string{"12", "11", "10", "2", "1"}; !reflect.DeepEqual(got, want) {
			t.Fatalf("ids = %v, want %v", got, want)
		}
	})

	t.Run("missing values sort last in both directions", func(t *testing.T) {
		for _, sortKey := range []string{"assignedTo", "-assignedTo"} {
			result, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{Sort: sortKey})
			if err != nil {
				t.Fatalf("WorkOrders() returned error: %v", err)
			}
			ids := idsOf(result.Items)
			if ids[0] != "2" && ids[0] != "12" {
				t.Fatalf("sort %s: ids = %v, want assigned orders first", sortKey, ids)
			}
		}
	})

	t.Run("priority sorts by rank", func(t *testing.T) {
		result, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{Sort: "-priority", Limit: 1})
		if err != nil {
			t.Fatalf("WorkOrders() returned error: %v", err)
		}
		if result.Items[0].ID != "10" || result.Total != 5 {
			t.Fatalf("first = %s (total %d), want urgent order 10 of 5", result.Items[0].ID, result.Total)
		}
	})

	t.Run("summary view omits history", func(t *testing.T) {
		summary, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{Summary: true, Status: domain.WorkOrderStatusCompleted})
		if err != nil {
			t.Fatalf("WorkOrders() returned error: %v", err)
		}
		if len(summary.Items) != 1 || len(summary.Items[0].StatusHistory) != 0 {
			t.Fatalf("summary = %#v, want order 12 without status history", summary.Items)
		}
		full, err := sqliteStore.WorkOrders(ctx, WorkOrderListQuery{Status: domain.WorkOrderStatusCompleted})
		if err != nil {
			t.Fatalf("WorkOrders() returned error: %v", err)
		}
		if len(full.Items[0].StatusHistory) != 1 {
			t.Fatalf("full view lost status history: %#v", full.Items[0].StatusHistory)
		}
	})
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := map[string]int{}
	for _, value := range a {
		seen[value]++
	}
	for _, value := range b {
		seen[value]--
	}
	for _, count := range seen {
		if count != 0 {
			return false
		}
	}
	return true
}

// TestWorkOrderListColumnsBackfill clears the denormalized columns and checks
// the v24 backfill restores them from the payload.
func TestWorkOrderListColumnsBackfill(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()
	for _, order := range listTestOrders() {
		if err := sqliteStore.PutWorkOrder(ctx, order); err != nil {
			t.Fatalf("PutWorkOrder(%s) returned error: %v", order.ID, err)
		}
	}
	if _, err := sqliteStore.db.ExecContext(ctx, `UPDATE work_orders SET billing_document_type = NULL,
		delivery_method = NULL, priority = '', is_completed = 0, search_text = '', order_number_sort = '',
		summary_payload = NULL`); err != nil {
		t.Fatalf("clear columns: %v", err)
	}
	tx, err := sqliteStore.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if err := backfillWorkOrderListColumns(ctx, tx); err != nil {
		t.Fatalf("backfill returned error: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	var billing, search, sortKey, summary string
	var completed int
	if err := sqliteStore.db.QueryRowContext(ctx,
		`SELECT billing_document_type, search_text, order_number_sort, summary_payload, is_completed
		 FROM work_orders WHERE id = '1'`).Scan(&billing, &search, &sortKey, &summary, &completed); err != nil {
		t.Fatalf("read backfilled row: %v", err)
	}
	if billing != "invoice" || !strings.Contains(search, "stamparija cobanovic") || sortKey == "" || summary == "" {
		t.Fatalf("backfilled row = %q %q %q %q", billing, search, sortKey, summary)
	}
	if err := sqliteStore.db.QueryRowContext(ctx,
		`SELECT is_completed FROM work_orders WHERE id = '12'`).Scan(&completed); err != nil || completed != 1 {
		t.Fatalf("is_completed = %d (%v), want 1", completed, err)
	}
}

func TestWriteWorkOrdersCSV(t *testing.T) {
	orders := listTestOrders()[:2]
	orders[0].JobDescription = `Vizit karte, "mat"`
	var buffer bytes.Buffer
	if err := WriteWorkOrdersCSV(&buffer, orders, []string{"clientName", "billing", "schedule", "price", "status"}); err != nil {
		t.Fatalf("WriteWorkOrdersCSV returned error: %v", err)
	}
	want := "\xEF\xBB\xBF" +
		"Br. naloga,Klijent,Tip dokumenta,Plan,Cena,Status\r\n" +
		"RN-2026-1,Štamparija Čobanović,Faktura,05.06.2026,12500.5,Nov\r\n" +
		"RN-2026-2,Klijent 2,Profaktura,10.06.2026,,Nov"
	if got := buffer.String(); got != want {
		t.Fatalf("csv =\n%q\nwant\n%q", got, want)
	}

	buffer.Reset()
	if err := WriteWorkOrdersCSV(&buffer, orders, []string{"jobDescription"}); err != nil {
		t.Fatalf("WriteWorkOrdersCSV returned error: %v", err)
	}
	if !strings.Contains(buffer.String(), `RN-2026-1,"Vizit karte, ""mat"""`) {
		t.Fatalf("csv = %q, want RFC 4180 quoting", buffer.String())
	}
}

// BenchmarkWorkOrderListSummary compares listing 5,000 orders (each carrying
// detail-page history) with the full payload versus the slim summary_payload.
//
//	go test ./internal/store -run '^$' -bench WorkOrderList -benchmem
func BenchmarkWorkOrderListSummary(b *testing.B) {
	ctx := ContextWithTenant(context.Background(), DemoTenantID)
	sqliteStore, err := OpenSQLite(ctx, filepath.Join(b.TempDir(), "iris.db"))
	if err != nil {
		b.Fatalf("OpenSQLite: %v", err)
	}
	defer sqliteStore.Close()
	if err := sqliteStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		b.Fatalf("EnsureTenant: %v", err)
	}
	const count = 5000
	for i := 1; i <= count; i++ {
		order := listTestOrder(fmt.Sprint(i), func(o *domain.WorkOrder) {
			for n := 0; n < 12; n++ {
				o.StatusHistory = append(o.StatusHistory, domain.WorkOrderStatusHistory{Status: domain.WorkOrderStatusNew, ChangedAt: "2026-06-01T08:00:00Z"})
				o.Events = append(o.Events, domain.WorkOrderEvent{ID: fmt.Sprint(n), Kind: "updated", Label: strings.Repeat("izmena polja ", 8), Actor: "admin", CreatedAt: "2026-06-01T08:00:00Z"})
			}
		})
		if err := sqliteStore.PutWorkOrder(ctx, order); err != nil {
			b.Fatalf("PutWorkOrder: %v", err)
		}
	}
	for _, mode := range []struct {
		name  string
		query WorkOrderListQuery
	}{
		{"full-all-5000", WorkOrderListQuery{}},
		{"summary-all-5000", WorkOrderListQuery{Summary: true}},
		{"summary-page-50", WorkOrderListQuery{Summary: true, Limit: 50, Sort: "-orderNumber"}},
		{"summary-search-page-50", WorkOrderListQuery{Summary: true, Limit: 50, Search: "klijent 49"}},
	} {
		b.Run(mode.name, func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				if _, err := sqliteStore.WorkOrders(ctx, mode.query); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
