package store

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func costTestStore(t *testing.T, ctx context.Context) *SQLiteStore {
	t.Helper()
	return newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
}

func mustUpsertCatalog(t *testing.T, ctx context.Context, s *SQLiteStore, id string, purchase, sale float64) string {
	t.Helper()
	item, err := s.UpsertCatalogItem(ctx, domain.CatalogItem{
		ID:            id,
		Code:          id,
		Name:          "Štampa " + id,
		Kind:          domain.CatalogItemKindService,
		Unit:          "kom",
		PurchasePrice: fptr(purchase),
		SalePrice:     fptr(sale),
		IsActive:      true,
	}, "")
	if err != nil {
		t.Fatalf("UpsertCatalogItem(%s): %v", id, err)
	}
	return item.ID
}

func catalogLine(id, catalogID string, qty int, unitPrice float64) domain.InvoiceLineItem {
	cid := catalogID
	return domain.InvoiceLineItem{
		ID:            id,
		Kind:          domain.InvoiceLineItemKindService,
		Description:   "Štampa plakata",
		Quantity:      qty,
		Unit:          "kom",
		UnitPrice:     unitPrice,
		CatalogItemID: &cid,
	}
}

func lineCost(line domain.InvoiceLineItem) *float64 { return line.UnitCost }

func hasEventKind(order *domain.WorkOrder, kind string) bool {
	for _, e := range order.Events {
		if e.Kind == kind {
			return true
		}
	}
	return false
}

func rawUpdate(t *testing.T, fields map[string]any) domain.UpdateWorkOrderInput {
	t.Helper()
	out := domain.UpdateWorkOrderInput{}
	for k, v := range fields {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal update field %s: %v", k, err)
		}
		out[k] = b
	}
	return out
}

// Cost is frozen at creation from the catalog cost in effect at the issue date,
// and a later non-status edit must not re-pull a changed catalog cost.
func TestWorkOrderCostFrozenAndPreservedOnEdit(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	catID := mustUpsertCatalog(t, ctx, s, "cat-a", 100, 250)

	today := time.Now().UTC().Format("2006-01-02")
	created, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Plakati",
		IssuedBy:       "admin",
		IssueDate:      today,
		InvoiceDraft: domain.InvoiceDraft{
			Status:    domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{catalogLine("li-1", catID, 2, 250)},
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}
	if got := lineCost(created.InvoiceDraft.LineItems[0]); got == nil || *got != 100 {
		t.Fatalf("created unitCost = %v, want 100", got)
	}
	if created.Profit == nil || *created.Profit != 300 { // (250-100)*2
		t.Fatalf("created profit = %v, want 300", created.Profit)
	}
	if created.NeedsCostReview {
		t.Fatal("created order should not need cost review")
	}

	// Catalog cost moves to 180; a non-status edit must keep the frozen 100.
	mustUpsertCatalog(t, ctx, s, "cat-a", 180, 250)
	edited, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{
		"clientName": "Klijent (izmenjen)",
	}))
	if err != nil {
		t.Fatalf("UpdateWorkOrder (edit): %v", err)
	}
	if got := lineCost(edited.InvoiceDraft.LineItems[0]); got == nil || *got != 100 {
		t.Fatalf("edited unitCost = %v, want 100 (frozen)", got)
	}
	if edited.Profit == nil || *edited.Profit != 300 {
		t.Fatalf("edited profit = %v, want 300 (frozen)", edited.Profit)
	}
}

// Completing an order re-snapshots catalog-line cost to the completion-date cost.
func TestWorkOrderCostResnapshotOnCompletion(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	catID := mustUpsertCatalog(t, ctx, s, "cat-b", 100, 250)

	today := time.Now().UTC().Format("2006-01-02")
	created, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Plakati",
		IssuedBy:       "admin",
		IssueDate:      today,
		InvoiceDraft: domain.InvoiceDraft{
			Status:    domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{catalogLine("li-1", catID, 2, 250)},
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}

	// Cost rises to 180 (same-day, in effect now). Walk the status path to
	// completed; the intermediate steps preserve the frozen 100.
	mustUpsertCatalog(t, ctx, s, "cat-b", 180, 250)
	for _, st := range []string{"assigned", "inProgress"} {
		stepped, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{"status": st}))
		if err != nil {
			t.Fatalf("UpdateWorkOrder (%s): %v", st, err)
		}
		if got := lineCost(stepped.InvoiceDraft.LineItems[0]); got == nil || *got != 100 {
			t.Fatalf("unitCost after %s = %v, want 100 (preserved)", st, got)
		}
	}
	completed, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{
		"status":         "completed",
		"isCompleted":    true,
		"completionDate": today,
	}))
	if err != nil {
		t.Fatalf("UpdateWorkOrder (complete): %v", err)
	}
	if got := lineCost(completed.InvoiceDraft.LineItems[0]); got == nil || *got != 180 {
		t.Fatalf("completed unitCost = %v, want 180 (re-snapshot)", got)
	}
	if completed.Profit == nil || *completed.Profit != 140 { // (250-180)*2
		t.Fatalf("completed profit = %v, want 140", completed.Profit)
	}
}

// catalogCostsAsOf returns the cost effective on the date, and falls back to the
// earliest record for dates before any record.
func TestCatalogCostsAsOf(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	id := mustUpsertCatalog(t, ctx, s, "cat-c", 100, 250)

	// Append two later historical periods directly (after today's creation row),
	// each applied as-of its own date (effectiveFrom == today), so they land as
	// closed historical periods rather than pending future schedules.
	if err := recordCatalogCost(ctx, s.db, id, fptr(120), fptr(250), "2027-02-01", "2027-02-01"); err != nil {
		t.Fatalf("recordCatalogCost feb: %v", err)
	}
	if err := recordCatalogCost(ctx, s.db, id, fptr(150), fptr(250), "2027-04-01", "2027-04-01"); err != nil {
		t.Fatalf("recordCatalogCost apr: %v", err)
	}

	cases := []struct {
		date string
		want float64
	}{
		{"2026-12-01", 100}, // after creation, before the 2027 changes
		{"2027-03-01", 120}, // within the Feb period
		{"2027-05-01", 150}, // within the Apr period
		{"2020-01-01", 100}, // before any record → earliest (creation) cost
	}
	for _, tc := range cases {
		costs, err := s.catalogCostsAsOf(ctx, []string{id}, tc.date)
		if err != nil {
			t.Fatalf("catalogCostsAsOf(%s): %v", tc.date, err)
		}
		if costs[id] != tc.want {
			t.Errorf("cost as of %s = %v, want %v", tc.date, costs[id], tc.want)
		}
	}
}

// An ad-hoc line (no catalog link) does not block the operator; the order saves,
// flags for review, and raises a cost_review event. An admin entering the cost
// clears the flag and raises cost_captured.
func TestAdHocCostReviewLifecycle(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	created, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Posebna usluga",
		IssuedBy:       "operater",
		IssueDate:      time.Now().UTC().Format("2006-01-02"),
		InvoiceDraft: domain.InvoiceDraft{
			Status: domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{{
				ID:          "li-adhoc",
				Kind:        domain.InvoiceLineItemKindService,
				Description: "Spec usluga",
				Quantity:    1,
				Unit:        "kom",
				UnitPrice:   200,
				// no CatalogItemID, no UnitCost
			}},
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder (ad-hoc): %v", err)
	}
	if !created.NeedsCostReview {
		t.Fatal("ad-hoc order should need cost review")
	}
	if got := lineCost(created.InvoiceDraft.LineItems[0]); got != nil {
		t.Fatalf("ad-hoc unitCost = %v, want nil", got)
	}
	if created.Profit == nil || *created.Profit != 0 {
		t.Fatalf("ad-hoc profit = %v, want 0 (cost unknown)", created.Profit)
	}
	if !hasEventKind(created, eventKindCostReview) {
		t.Fatal("expected cost_review event")
	}

	// Admin fills the cost: review clears, profit computed, cost_captured raised.
	draft := domain.InvoiceDraft{
		Status: domain.InvoiceDraftStatusDraft,
		LineItems: []domain.InvoiceLineItem{{
			ID:          "li-adhoc",
			Kind:        domain.InvoiceLineItemKindService,
			Description: "Spec usluga",
			Quantity:    1,
			Unit:        "kom",
			UnitPrice:   200,
			UnitCost:    fptr(60),
		}},
	}
	updated, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{
		"invoiceDraft": draft,
	}))
	if err != nil {
		t.Fatalf("UpdateWorkOrder (fill cost): %v", err)
	}
	if updated.NeedsCostReview {
		t.Fatal("review should be cleared after admin fills cost")
	}
	if got := lineCost(updated.InvoiceDraft.LineItems[0]); got == nil || *got != 60 {
		t.Fatalf("filled unitCost = %v, want 60", got)
	}
	if updated.Profit == nil || *updated.Profit != 140 { // (200-60)*1
		t.Fatalf("filled profit = %v, want 140", updated.Profit)
	}
	if !hasEventKind(updated, eventKindCostCaptured) {
		t.Fatal("expected cost_captured event")
	}
}

// A catalog line whose catalog item has no cost on record behaves like an ad-hoc
// line: it flags for review, and an admin can fill the cost directly on the line.
// The gap-filled cost persists (freezes) and later edits must not wipe it.
func TestCatalogLineMissingCostAdminGapFill(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	// Catalog item with a sale price but no purchase price (no cost on record).
	item, err := s.UpsertCatalogItem(ctx, domain.CatalogItem{
		ID:            "cat-nocost",
		Code:          "cat-nocost",
		Name:          "Usluga bez troška",
		Kind:          domain.CatalogItemKindService,
		Unit:          "kom",
		PurchasePrice: nil,
		SalePrice:     fptr(250),
		IsActive:      true,
	}, "")
	if err != nil {
		t.Fatalf("UpsertCatalogItem: %v", err)
	}

	today := time.Now().UTC().Format("2006-01-02")
	created, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Plakati",
		IssuedBy:       "admin",
		IssueDate:      today,
		InvoiceDraft: domain.InvoiceDraft{
			Status:    domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{catalogLine("li-1", item.ID, 2, 250)},
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}
	if !created.NeedsCostReview {
		t.Fatal("catalog line with no catalog cost should need review")
	}
	if got := lineCost(created.InvoiceDraft.LineItems[0]); got != nil {
		t.Fatalf("created unitCost = %v, want nil", got)
	}

	// Admin fills the cost on the catalog line; it must persist and clear review
	// even though the catalog still has no cost of its own.
	filledLine := catalogLine("li-1", item.ID, 2, 250)
	filledLine.UnitCost = fptr(90)
	updated, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{
		"invoiceDraft": domain.InvoiceDraft{
			Status:    domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{filledLine},
		},
	}))
	if err != nil {
		t.Fatalf("UpdateWorkOrder (gap-fill): %v", err)
	}
	if updated.NeedsCostReview {
		t.Fatal("review should clear after admin fills the catalog-line cost")
	}
	if got := lineCost(updated.InvoiceDraft.LineItems[0]); got == nil || *got != 90 {
		t.Fatalf("filled unitCost = %v, want 90", got)
	}
	if updated.Profit == nil || *updated.Profit != 320 { // (250-90)*2
		t.Fatalf("filled profit = %v, want 320", updated.Profit)
	}
	if !hasEventKind(updated, eventKindCostCaptured) {
		t.Fatal("expected cost_captured event")
	}

	// A later unrelated edit must preserve the admin-entered cost (freeze).
	edited, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{
		"clientName": "Klijent (izmenjen)",
	}))
	if err != nil {
		t.Fatalf("UpdateWorkOrder (later edit): %v", err)
	}
	if got := lineCost(edited.InvoiceDraft.LineItems[0]); got == nil || *got != 90 {
		t.Fatalf("preserved unitCost = %v, want 90 (frozen)", got)
	}
}

// A catalog line whose catalog item HAS a cost stays authoritative: an admin's
// attempt to override it on the line is ignored in favor of the catalog cost.
func TestCatalogLineWithCostIgnoresLineOverride(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	catID := mustUpsertCatalog(t, ctx, s, "cat-priced", 100, 250)

	today := time.Now().UTC().Format("2006-01-02")
	created, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Plakati",
		IssuedBy:       "admin",
		IssueDate:      today,
		InvoiceDraft: domain.InvoiceDraft{
			Status:    domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{catalogLine("li-1", catID, 2, 250)},
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}

	// Try to override the catalog cost (100) with a line value (5); it must not win.
	overrideLine := catalogLine("li-1", catID, 2, 250)
	overrideLine.UnitCost = fptr(5)
	updated, err := s.UpdateWorkOrder(ctx, created.ID, rawUpdate(t, map[string]any{
		"invoiceDraft": domain.InvoiceDraft{
			Status:    domain.InvoiceDraftStatusDraft,
			LineItems: []domain.InvoiceLineItem{overrideLine},
		},
	}))
	if err != nil {
		t.Fatalf("UpdateWorkOrder (override attempt): %v", err)
	}
	if got := lineCost(updated.InvoiceDraft.LineItems[0]); got == nil || *got != 100 {
		t.Fatalf("unitCost = %v, want 100 (catalog authoritative)", got)
	}
}
