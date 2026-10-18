package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestParseWorkOrderListFilters(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"/work-orders?search=cob&billingDocumentType=invoice&deliveryMethod=pickup&customerId=c1"+
			"&queue=overdue&today=2026-06-10&sort=-priority&view=summary&offset=-3", nil)
	got := parseWorkOrderListQuery(req)
	if got.Search != "cob" || got.BillingDocumentType != "invoice" || got.DeliveryMethod != "pickup" ||
		got.CustomerID != "c1" || got.Queue != "overdue" || got.Today != "2026-06-10" ||
		got.Sort != "-priority" || !got.Summary || got.Offset != 0 {
		t.Fatalf("query = %#v", got)
	}

	bad := httptest.NewRequest(http.MethodGet, "/work-orders?queue=nope&today=10.06.2026", nil)
	if got := parseWorkOrderListQuery(bad); got.Queue != "" || got.Today != "" {
		t.Fatalf("invalid queue/today should be dropped, got %#v", got)
	}
}

func TestWorkOrderListPagesWithTotal(t *testing.T) {
	response := performRequest(t, newTestServer(t), http.MethodGet, "/work-orders?view=summary&limit=10&offset=10&sort=-orderNumber", "")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var result store.WorkOrderListResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(result.Items) != 10 || result.Total != 43 {
		t.Fatalf("got %d items / total %d, want a 10-item page of 43", len(result.Items), result.Total)
	}
}

func TestExportWorkOrdersCSV(t *testing.T) {
	server := newTestServer(t)
	all := performRequest(t, server, http.MethodGet, "/work-orders/export.csv?columns=clientName,status", "")
	if all.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", all.Code, http.StatusOK, all.Body.String())
	}
	if ct := all.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Fatalf("Content-Type = %q, want text/csv", ct)
	}
	body := all.Body.String()
	if !strings.HasPrefix(body, "\xEF\xBB\xBFBr. naloga,Klijent,Status\r\n") {
		t.Fatalf("csv header = %q", body[:min(len(body), 60)])
	}
	// Unpaged: every one of the 43 fixture orders, beyond the list's default page.
	if rows := strings.Count(body, "\r\n"); rows != 43 {
		t.Fatalf("csv has %d data rows, want 43", rows)
	}

	filtered := performRequest(t, server, http.MethodGet, "/work-orders/export.csv?status=cancelled", "")
	if got := filtered.Header().Get("X-Total-Count"); got == "" || got == "43" {
		t.Fatalf("X-Total-Count = %q, want the filtered count", got)
	}
}
