package store

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func strptr(s string) *string { return &s }
func fptr(f float64) *float64 { return &f }

func TestDiffPrice(t *testing.T) {
	cases := []struct {
		name string
		in   *float64
		want string
	}{
		{"nil", nil, "—"},
		{"zero", fptr(0), "0 RSD"},
		{"thousands", fptr(1000), "1.000 RSD"},
		{"sixty-seven k", fptr(67000), "67.000 RSD"},
		{"millions group", fptr(1234567), "1.234.567 RSD"},
		{"decimals trimmed", fptr(999.5), "999,5 RSD"},
		{"two decimals", fptr(12.25), "12,25 RSD"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := diffPrice(c.in); got != c.want {
				t.Fatalf("diffPrice(%v) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestDiffDate(t *testing.T) {
	cases := []struct {
		name string
		in   *string
		want string
	}{
		{"nil", nil, "—"},
		{"blank", strptr("  "), "—"},
		{"iso to dotted", strptr("2026-09-30"), "30.09.2026"},
		{"unparseable passthrough", strptr("not-a-date"), "not-a-date"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := diffDate(c.in); got != c.want {
				t.Fatalf("diffDate(%v) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestDiffEnumLabels(t *testing.T) {
	if got := workOrderPriorityLabel(domain.WorkOrderPriorityUrgent); got != "Hitno" {
		t.Fatalf("priority urgent = %q, want Hitno", got)
	}
	if got := workOrderPriorityLabel(domain.WorkOrderPriorityNormal); got != "Normalan" {
		t.Fatalf("priority normal = %q, want Normalan", got)
	}

	invoice := domain.BillingDocumentTypeInvoice
	if got := billingDocumentTypeLabel(&invoice); got != "Faktura" {
		t.Fatalf("billing invoice = %q, want Faktura", got)
	}
	if got := billingDocumentTypeLabel(nil); got != "—" {
		t.Fatalf("billing nil = %q, want —", got)
	}

	post := domain.DeliveryMethodPostExpress
	if got := deliveryMethodLabel(&post); got != "Post Express" {
		t.Fatalf("delivery postExpress = %q, want Post Express", got)
	}
	if got := deliveryMethodLabel(nil); got != "—" {
		t.Fatalf("delivery nil = %q, want —", got)
	}
}

// A status-only update must log the status change but no spurious field diffs.
func TestAppendChangeEventsIgnoresStatusOnlyAndUnchanged(t *testing.T) {
	base := domain.WorkOrder{
		ClientName:     "Acme",
		JobDescription: "Posao",
		IssuedBy:       "admin",
		Assignment:     domain.Assignment{Priority: domain.WorkOrderPriorityNormal},
	}
	// Identical pre/post: no change events.
	updated := base
	appendWorkOrderChangeEvents(&base, &updated)
	if len(updated.Events) != 0 {
		t.Fatalf("unchanged order produced %d events, want 0: %#v", len(updated.Events), updated.Events)
	}

	// Only price changed: exactly one diff event.
	post := base
	post.Price = fptr(500)
	appendWorkOrderChangeEvents(&base, &post)
	if len(post.Events) != 1 {
		t.Fatalf("price change produced %d events, want 1", len(post.Events))
	}
	if post.Events[0].Kind != "change" || post.Events[0].Label != "Cena: — → 500 RSD" {
		t.Fatalf("unexpected event: %+v", post.Events[0])
	}
}
