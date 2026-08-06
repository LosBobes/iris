package store

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// emptyService builds a service catalog item with no prices set at all.
func emptyService(id string) domain.CatalogItem {
	return domain.CatalogItem{
		ID:            id,
		Code:          id,
		Name:          "Usluga " + id,
		Kind:          domain.CatalogItemKindService,
		Unit:          "m2",
		PurchasePrice: nil,
		SalePrice:     nil,
		IsActive:      true,
	}
}

// DeleteEmptyServiceCatalogItems removes only priceless service rows and leaves
// everything with a purchase or sale price — and every article — untouched.
func TestDeleteEmptyServiceCatalogItems(t *testing.T) {
	ctx := testTenantContext()
	s := costTestStore(t, ctx)

	// Two priceless services (should be swept).
	upsertCatalog(t, ctx, s, emptyService("svc-empty-1"), "")
	upsertCatalog(t, ctx, s, emptyService("svc-empty-2"), "")

	// A service with only a purchase price, and one with only a sale price: both kept.
	onlyPurchase := emptyService("svc-purchase")
	onlyPurchase.PurchasePrice = fptr(400)
	upsertCatalog(t, ctx, s, onlyPurchase, "")
	onlySale := emptyService("svc-sale")
	onlySale.SalePrice = fptr(1400)
	upsertCatalog(t, ctx, s, onlySale, "")

	// A fully priced service and a priceless article: both kept.
	upsertCatalog(t, ctx, s, baseCatalogItem("svc-full", 400, 1400), "")
	article := emptyService("art-empty")
	article.Kind = domain.CatalogItemKindArticle
	upsertCatalog(t, ctx, s, article, "")

	deleted, err := s.DeleteEmptyServiceCatalogItems(ctx)
	if err != nil {
		t.Fatalf("DeleteEmptyServiceCatalogItems: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("deleted = %d, want 2", deleted)
	}

	result, err := s.CatalogItems(ctx, CatalogItemQuery{})
	if err != nil {
		t.Fatalf("CatalogItems: %v", err)
	}
	if result.Total != 4 {
		t.Fatalf("remaining total = %d, want 4", result.Total)
	}
	for _, item := range result.Items {
		if item.ID == "svc-empty-1" || item.ID == "svc-empty-2" {
			t.Fatalf("priceless service %s should have been deleted", item.ID)
		}
	}

	// A second run with nothing left to clean removes nothing.
	again, err := s.DeleteEmptyServiceCatalogItems(ctx)
	if err != nil {
		t.Fatalf("DeleteEmptyServiceCatalogItems (second run): %v", err)
	}
	if again != 0 {
		t.Fatalf("second cleanup deleted = %d, want 0", again)
	}
}
