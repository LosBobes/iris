package store

import (
	"context"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func todayStr() string { return time.Now().UTC().Format("2006-01-02") }

func plusDays(n int) string { return time.Now().UTC().AddDate(0, 0, n).Format("2006-01-02") }

// upsertCatalog is a thin wrapper that fails the test on error.
func upsertCatalog(t *testing.T, ctx context.Context, s *SQLiteStore, item domain.CatalogItem, effectiveFrom string) *domain.CatalogItem {
	t.Helper()
	result, err := s.UpsertCatalogItem(ctx, item, effectiveFrom)
	if err != nil {
		t.Fatalf("UpsertCatalogItem(%s, %q): %v", item.ID, effectiveFrom, err)
	}
	return result
}

func priceAsOf(t *testing.T, ctx context.Context, s *SQLiteStore, id, date string) catalogPrice {
	t.Helper()
	prices, err := s.catalogPricesAsOf(ctx, []string{id}, date)
	if err != nil {
		t.Fatalf("catalogPricesAsOf(%s, %s): %v", id, date, err)
	}
	return prices[id]
}

func wantPurchase(t *testing.T, got *float64, want float64) {
	t.Helper()
	if got == nil {
		t.Fatalf("purchase price = nil, want %v", want)
	}
	if *got != want {
		t.Fatalf("purchase price = %v, want %v", *got, want)
	}
}

func baseCatalogItem(id string, purchase, sale float64) domain.CatalogItem {
	return domain.CatalogItem{
		ID:            id,
		Code:          id,
		Name:          "Štampa " + id,
		Kind:          domain.CatalogItemKindService,
		Unit:          "kom",
		PurchasePrice: fptr(purchase),
		SalePrice:     fptr(sale),
		IsActive:      true,
	}
}

// countPendingFuture returns how many not-yet-effective (future, still-open)
// price records exist for the item.
func countPendingFuture(t *testing.T, ctx context.Context, s *SQLiteStore, id string) int {
	t.Helper()
	var n int
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM catalog_item_price_history
		  WHERE catalog_item_id = ? AND effective_from > ? AND effective_to IS NULL`,
		id, todayStr(),
	).Scan(&n); err != nil {
		t.Fatalf("count pending future: %v", err)
	}
	return n
}

// A future-dated price change must not alter the item's displayed current price
// until the effective date arrives, but must resolve as the effective cost on and
// after that date.
func TestCatalogFutureDatedPriceHiddenUntilEffective(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	upsertCatalog(t, ctx, s, baseCatalogItem("cat-fut", 100, 250), "")

	// Schedule a purchase-price bump effective tomorrow.
	result := upsertCatalog(t, ctx, s, baseCatalogItem("cat-fut", 120, 250), plusDays(1))

	// The save response reflects the still-current (old) price, not the scheduled one.
	wantPurchase(t, result.PurchasePrice, 100)

	// Reading the item today shows the old price; only tomorrow shows the new one.
	item, err := s.CatalogItemByID(ctx, "cat-fut")
	if err != nil || item == nil {
		t.Fatalf("CatalogItemByID: %v (item=%v)", err, item)
	}
	wantPurchase(t, item.PurchasePrice, 100)

	wantPurchase(t, priceAsOf(t, ctx, s, "cat-fut", todayStr()).Purchase, 100)
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-fut", plusDays(1)).Purchase, 120)
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-fut", plusDays(5)).Purchase, 120)

	if got := countPendingFuture(t, ctx, s, "cat-fut"); got != 1 {
		t.Fatalf("pending future records = %d, want 1", got)
	}
}

// Rescheduling before the first change takes effect supersedes the pending record
// so at most one future change is ever queued.
func TestCatalogRescheduleKeepsSinglePending(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	upsertCatalog(t, ctx, s, baseCatalogItem("cat-re", 100, 250), "")
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-re", 120, 250), plusDays(1))
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-re", 130, 250), plusDays(2))

	if got := countPendingFuture(t, ctx, s, "cat-re"); got != 1 {
		t.Fatalf("pending future records = %d, want 1 (reschedule should supersede)", got)
	}
	// Today unchanged; the surviving pending change is the latest (130) on day two.
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-re", todayStr()).Purchase, 100)
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-re", plusDays(2)).Purchase, 130)
	// The superseded day-one price (120) never takes effect.
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-re", plusDays(1)).Purchase, 100)
}

// An incidental re-save that does not change the current price (e.g. an operator
// kind-only edit) must leave a pending future schedule intact.
func TestCatalogNoopSavePreservesPendingSchedule(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	upsertCatalog(t, ctx, s, baseCatalogItem("cat-noop", 100, 250), "")
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-noop", 120, 250), plusDays(1))

	// Re-save with the (unchanged) current price and no effective date, mirroring
	// the operator kind-only edit path.
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-noop", 100, 250), "")

	if got := countPendingFuture(t, ctx, s, "cat-noop"); got != 1 {
		t.Fatalf("pending future records = %d, want 1 (no-op save must not cancel schedule)", got)
	}
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-noop", plusDays(1)).Purchase, 120)
}

// A same-day price correction updates the current period in place rather than
// creating a second record for the same day.
func TestCatalogSameDayCorrectionInPlace(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	upsertCatalog(t, ctx, s, baseCatalogItem("cat-day", 100, 250), "")
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-day", 150, 250), "") // same day, immediate

	var n int
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM catalog_item_price_history WHERE catalog_item_id = ?`,
		"cat-day",
	).Scan(&n); err != nil {
		t.Fatalf("count records: %v", err)
	}
	if n != 1 {
		t.Fatalf("history records = %d, want 1 (same-day correction updates in place)", n)
	}
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-day", todayStr()).Purchase, 150)
}

// An immediate change scheduled today supersedes any pending future change.
func TestCatalogImmediateChangeSupersedesFuture(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	upsertCatalog(t, ctx, s, baseCatalogItem("cat-imm", 100, 250), "")
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-imm", 120, 250), plusDays(1)) // schedule
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-imm", 90, 250), "")           // immediate today

	if got := countPendingFuture(t, ctx, s, "cat-imm"); got != 0 {
		t.Fatalf("pending future records = %d, want 0 (immediate change supersedes)", got)
	}
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-imm", todayStr()).Purchase, 90)
	// The scheduled 120 never takes effect.
	wantPurchase(t, priceAsOf(t, ctx, s, "cat-imm", plusDays(1)).Purchase, 90)
}

// The list endpoint resolves each item's price as of today, hiding a scheduled
// future price until its date.
func TestCatalogListShowsAsOfTodayPrice(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	upsertCatalog(t, ctx, s, baseCatalogItem("cat-list", 100, 250), "")
	upsertCatalog(t, ctx, s, baseCatalogItem("cat-list", 120, 260), plusDays(1))

	result, err := s.CatalogItems(ctx, CatalogItemQuery{})
	if err != nil {
		t.Fatalf("CatalogItems: %v", err)
	}
	var found bool
	for _, item := range result.Items {
		if item.ID != "cat-list" {
			continue
		}
		found = true
		wantPurchase(t, item.PurchasePrice, 100)
		if item.SalePrice == nil || *item.SalePrice != 250 {
			t.Fatalf("sale price = %v, want 250", item.SalePrice)
		}
	}
	if !found {
		t.Fatal("cat-list not returned by CatalogItems")
	}
}
