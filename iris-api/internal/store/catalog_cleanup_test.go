package store

import (
	"context"
	"sort"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// cleanupStore is the slice of Store the admin catalog cleanup uses. Both the
// SQLite store and the fixture store are driven through it so the two can never
// drift on what a filter means.
type cleanupStore interface {
	UpsertCatalogItem(ctx context.Context, item domain.CatalogItem, effectiveFrom string) (*domain.CatalogItem, error)
	CatalogItemsMissingPrices(ctx context.Context, filter CatalogCleanupFilter) ([]domain.CatalogItem, error)
	DeleteCatalogItemsMissingPrices(ctx context.Context, filter CatalogCleanupFilter) (int, error)
	CatalogItems(ctx context.Context, query CatalogItemQuery) (CatalogItemListResult, error)
}

// cleanupSpec is one seeded catalog item: an id, its kind, and which prices it
// carries. The ids double as the expectations in the matrix below.
type cleanupSpec struct {
	id       string
	kind     domain.CatalogItemKind
	purchase *float64
	sale     *float64
}

// cleanupMatrix seeds every combination of kind × price state (no prices, only a
// purchase price, only a sale price, both), which is the full space the two
// filter axes select over.
func cleanupMatrix() []cleanupSpec {
	specs := make([]cleanupSpec, 0, 8)
	for _, kind := range []domain.CatalogItemKind{domain.CatalogItemKindService, domain.CatalogItemKindArticle} {
		prefix := "svc"
		if kind == domain.CatalogItemKindArticle {
			prefix = "art"
		}
		specs = append(specs,
			cleanupSpec{id: prefix + "-none", kind: kind},
			cleanupSpec{id: prefix + "-purchase-only", kind: kind, purchase: fptr(400)},
			cleanupSpec{id: prefix + "-sale-only", kind: kind, sale: fptr(1400)},
			cleanupSpec{id: prefix + "-both", kind: kind, purchase: fptr(400), sale: fptr(1400)},
		)
	}
	return specs
}

func seedCleanupMatrix(t *testing.T, ctx context.Context, s cleanupStore) {
	t.Helper()
	for _, spec := range cleanupMatrix() {
		item := domain.CatalogItem{
			ID:            spec.id,
			Code:          spec.id,
			Name:          "Stavka " + spec.id,
			Kind:          spec.kind,
			Unit:          "kom",
			PurchasePrice: spec.purchase,
			SalePrice:     spec.sale,
			IsActive:      true,
		}
		if _, err := s.UpsertCatalogItem(ctx, item, ""); err != nil {
			t.Fatalf("seed %s: %v", spec.id, err)
		}
	}
}

func sortedIDs(items []domain.CatalogItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	sort.Strings(ids)
	return ids
}

func remainingIDs(t *testing.T, ctx context.Context, s cleanupStore) []string {
	t.Helper()
	result, err := s.CatalogItems(ctx, CatalogItemQuery{})
	if err != nil {
		t.Fatalf("CatalogItems: %v", err)
	}
	if result.Total != len(result.Items) {
		t.Fatalf("total = %d but got %d items", result.Total, len(result.Items))
	}
	return sortedIDs(result.Items)
}

// cleanupCases enumerates every (kinds, missing) filter with the exact ids it
// must match. Read `missing` as "which price is absent": purchase matches items
// with no purchase price whether or not they have a sale price, and vice versa;
// both matches only items with neither.
func cleanupCases() []struct {
	name   string
	filter CatalogCleanupFilter
	want   []string
} {
	services := []domain.CatalogItemKind{domain.CatalogItemKindService}
	articles := []domain.CatalogItemKind{domain.CatalogItemKindArticle}
	bothKinds := []domain.CatalogItemKind{domain.CatalogItemKindService, domain.CatalogItemKindArticle}

	return []struct {
		name   string
		filter CatalogCleanupFilter
		want   []string
	}{
		{
			name:   "services missing purchase price",
			filter: CatalogCleanupFilter{Kinds: services, Missing: CleanupMissingPurchase},
			want:   []string{"svc-none", "svc-sale-only"},
		},
		{
			name:   "services missing sale price",
			filter: CatalogCleanupFilter{Kinds: services, Missing: CleanupMissingSale},
			want:   []string{"svc-none", "svc-purchase-only"},
		},
		{
			name:   "services missing both prices",
			filter: CatalogCleanupFilter{Kinds: services, Missing: CleanupMissingBoth},
			want:   []string{"svc-none"},
		},
		{
			name:   "articles missing purchase price",
			filter: CatalogCleanupFilter{Kinds: articles, Missing: CleanupMissingPurchase},
			want:   []string{"art-none", "art-sale-only"},
		},
		{
			name:   "articles missing sale price",
			filter: CatalogCleanupFilter{Kinds: articles, Missing: CleanupMissingSale},
			want:   []string{"art-none", "art-purchase-only"},
		},
		{
			name:   "articles missing both prices",
			filter: CatalogCleanupFilter{Kinds: articles, Missing: CleanupMissingBoth},
			want:   []string{"art-none"},
		},
		{
			name:   "both kinds missing purchase price",
			filter: CatalogCleanupFilter{Kinds: bothKinds, Missing: CleanupMissingPurchase},
			want:   []string{"art-none", "art-sale-only", "svc-none", "svc-sale-only"},
		},
		{
			name:   "both kinds missing sale price",
			filter: CatalogCleanupFilter{Kinds: bothKinds, Missing: CleanupMissingSale},
			want:   []string{"art-none", "art-purchase-only", "svc-none", "svc-purchase-only"},
		},
		{
			name:   "both kinds missing both prices",
			filter: CatalogCleanupFilter{Kinds: bothKinds, Missing: CleanupMissingBoth},
			want:   []string{"art-none", "svc-none"},
		},
	}
}

// removeIDs returns all seeded ids except the deleted ones, sorted — what must
// be left in the catalog after a cleanup.
func removeIDs(deleted []string) []string {
	gone := map[string]bool{}
	for _, id := range deleted {
		gone[id] = true
	}
	remaining := make([]string, 0, len(cleanupMatrix()))
	for _, spec := range cleanupMatrix() {
		if !gone[spec.id] {
			remaining = append(remaining, spec.id)
		}
	}
	sort.Strings(remaining)
	return remaining
}

func equalIDs(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

// runCleanupMatrix drives one store through every filter combination, asserting
// three things per case: the preview lists exactly the right items, the delete
// removes exactly those, and everything else survives.
func runCleanupMatrix(t *testing.T, newStore func(t *testing.T, ctx context.Context) cleanupStore) {
	t.Helper()
	for _, testCase := range cleanupCases() {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := testTenantContext()
			s := newStore(t, ctx)
			seedCleanupMatrix(t, ctx, s)

			preview, err := s.CatalogItemsMissingPrices(ctx, testCase.filter)
			if err != nil {
				t.Fatalf("CatalogItemsMissingPrices: %v", err)
			}
			if got := sortedIDs(preview); !equalIDs(got, testCase.want) {
				t.Fatalf("preview = %v, want %v", got, testCase.want)
			}

			deleted, err := s.DeleteCatalogItemsMissingPrices(ctx, testCase.filter)
			if err != nil {
				t.Fatalf("DeleteCatalogItemsMissingPrices: %v", err)
			}
			if deleted != len(testCase.want) {
				t.Fatalf("deleted = %d, want %d (%v)", deleted, len(testCase.want), testCase.want)
			}
			if got, want := remainingIDs(t, ctx, s), removeIDs(testCase.want); !equalIDs(got, want) {
				t.Fatalf("remaining = %v, want %v", got, want)
			}

			// Re-running the same cleanup is a no-op: nothing is left to match.
			again, err := s.DeleteCatalogItemsMissingPrices(ctx, testCase.filter)
			if err != nil {
				t.Fatalf("DeleteCatalogItemsMissingPrices (second run): %v", err)
			}
			if again != 0 {
				t.Fatalf("second cleanup deleted = %d, want 0", again)
			}
		})
	}
}

// TestCatalogCleanupMatrixSQLite proves the SQLite cleanup matches exactly the
// items a filter selects — both axes, every combination.
func TestCatalogCleanupMatrixSQLite(t *testing.T) {
	runCleanupMatrix(t, func(t *testing.T, ctx context.Context) cleanupStore {
		return costTestStore(t, ctx)
	})
}

// TestCatalogCleanupMatrixFixtures proves the in-memory fixture store used by
// tests and seeding agrees with SQLite on every filter combination.
func TestCatalogCleanupMatrixFixtures(t *testing.T) {
	runCleanupMatrix(t, func(t *testing.T, _ context.Context) cleanupStore {
		return NewFixtureStore(t.TempDir())
	})
}

// TestCatalogCleanupEmptyKindsIsNoOp guards the fail-safe direction: a filter
// with no kinds must delete nothing rather than everything.
func TestCatalogCleanupEmptyKindsIsNoOp(t *testing.T) {
	for _, missing := range []CatalogCleanupMissing{CleanupMissingPurchase, CleanupMissingSale, CleanupMissingBoth} {
		ctx := testTenantContext()
		s := costTestStore(t, ctx)
		seedCleanupMatrix(t, ctx, s)

		filter := CatalogCleanupFilter{Missing: missing}
		preview, err := s.CatalogItemsMissingPrices(ctx, filter)
		if err != nil {
			t.Fatalf("CatalogItemsMissingPrices(no kinds, %s): %v", missing, err)
		}
		if len(preview) != 0 {
			t.Fatalf("preview with no kinds = %v, want empty", sortedIDs(preview))
		}
		deleted, err := s.DeleteCatalogItemsMissingPrices(ctx, filter)
		if err != nil {
			t.Fatalf("DeleteCatalogItemsMissingPrices(no kinds, %s): %v", missing, err)
		}
		if deleted != 0 {
			t.Fatalf("deleted with no kinds = %d, want 0", deleted)
		}
		if got, want := remainingIDs(t, ctx, s), removeIDs(nil); !equalIDs(got, want) {
			t.Fatalf("remaining = %v, want the full catalog %v", got, want)
		}
	}
}

// TestCatalogCleanupUnknownMissingFallsBackToNarrowest proves an unrecognized
// price mode can never widen a sweep: it behaves like "both prices missing",
// the smallest possible match.
func TestCatalogCleanupUnknownMissingFallsBackToNarrowest(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	seedCleanupMatrix(t, ctx, s)

	filter := CatalogCleanupFilter{
		Kinds:   []domain.CatalogItemKind{domain.CatalogItemKindService, domain.CatalogItemKindArticle},
		Missing: CatalogCleanupMissing("anything-else"),
	}
	preview, err := s.CatalogItemsMissingPrices(ctx, filter)
	if err != nil {
		t.Fatalf("CatalogItemsMissingPrices: %v", err)
	}
	want := []string{"art-none", "svc-none"}
	if got := sortedIDs(preview); !equalIDs(got, want) {
		t.Fatalf("preview = %v, want %v", got, want)
	}

	// The fixture store must fall back the same way.
	fixtures := NewFixtureStore(t.TempDir())
	seedCleanupMatrix(t, ctx, fixtures)
	fixturePreview, err := fixtures.CatalogItemsMissingPrices(ctx, filter)
	if err != nil {
		t.Fatalf("fixture CatalogItemsMissingPrices: %v", err)
	}
	if got := sortedIDs(fixturePreview); !equalIDs(got, want) {
		t.Fatalf("fixture preview = %v, want %v", got, want)
	}
}

// TestCatalogCleanupIsTenantScoped proves a cleanup never reaches across
// tenants: another organization's priceless items survive untouched.
func TestCatalogCleanupIsTenantScoped(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	seedCleanupMatrix(t, ctx, s)

	const otherTenant = "tenant-other"
	if err := s.EnsureTenant(ctx, otherTenant, "other", "Druga štamparija"); err != nil {
		t.Fatalf("EnsureTenant(other): %v", err)
	}
	otherCtx := ContextWithTenant(context.Background(), otherTenant)
	otherItem := domain.CatalogItem{
		ID:       "other-none",
		Code:     "other-none",
		Name:     "Tuđa prazna usluga",
		Kind:     domain.CatalogItemKindService,
		Unit:     "kom",
		IsActive: true,
	}
	if _, err := s.UpsertCatalogItem(otherCtx, otherItem, ""); err != nil {
		t.Fatalf("seed other tenant item: %v", err)
	}

	filter := CatalogCleanupFilter{
		Kinds:   []domain.CatalogItemKind{domain.CatalogItemKindService, domain.CatalogItemKindArticle},
		Missing: CleanupMissingBoth,
	}
	if _, err := s.DeleteCatalogItemsMissingPrices(ctx, filter); err != nil {
		t.Fatalf("DeleteCatalogItemsMissingPrices: %v", err)
	}

	other, err := s.CatalogItems(otherCtx, CatalogItemQuery{})
	if err != nil {
		t.Fatalf("CatalogItems(other tenant): %v", err)
	}
	if got := sortedIDs(other.Items); !equalIDs(got, []string{"other-none"}) {
		t.Fatalf("other tenant catalog = %v, want [other-none] (tenant %s)", got, otherTenant)
	}
}

// TestCatalogCleanupWithoutTenantFails proves the store fails loud rather than
// deleting across every tenant when the request carries no tenant.
func TestCatalogCleanupWithoutTenantFails(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)
	seedCleanupMatrix(t, ctx, s)

	filter := CatalogCleanupFilter{
		Kinds:   []domain.CatalogItemKind{domain.CatalogItemKindService},
		Missing: CleanupMissingBoth,
	}
	if _, err := s.CatalogItemsMissingPrices(context.Background(), filter); err == nil {
		t.Fatal("CatalogItemsMissingPrices without a tenant should fail")
	}
	if _, err := s.DeleteCatalogItemsMissingPrices(context.Background(), filter); err == nil {
		t.Fatal("DeleteCatalogItemsMissingPrices without a tenant should fail")
	}
	if got, want := remainingIDs(t, ctx, s), removeIDs(nil); !equalIDs(got, want) {
		t.Fatalf("remaining = %v, want the full catalog %v", got, want)
	}
}
