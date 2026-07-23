package store

import (
	"context"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// CatalogItems returns in-memory catalog items filtered and paginated like the
// SQLite store.
func (s *FixtureStore) CatalogItems(
	_ context.Context,
	query CatalogItemQuery,
) (CatalogItemListResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	search := strings.ToLower(strings.TrimSpace(query.Search))
	matched := make([]domain.CatalogItem, 0, len(s.catalogItems))
	for _, item := range s.catalogItems {
		if query.Kind != "" && item.Kind != query.Kind {
			continue
		}
		if query.ActiveOnly && !item.IsActive {
			continue
		}
		if search != "" &&
			!strings.Contains(strings.ToLower(item.Name), search) &&
			!strings.Contains(strings.ToLower(item.Code), search) {
			continue
		}
		matched = append(matched, cloneCatalogItem(item))
	}

	total := len(matched)
	if query.Limit > 0 {
		offset := query.Offset
		if offset < 0 {
			offset = 0
		}
		if offset >= len(matched) {
			matched = []domain.CatalogItem{}
		} else {
			end := offset + query.Limit
			if end > len(matched) {
				end = len(matched)
			}
			matched = matched[offset:end]
		}
	}
	return CatalogItemListResult{Items: matched, Total: total}, nil
}

// CatalogItemByID returns a single in-memory catalog item, or nil when missing.
func (s *FixtureStore) CatalogItemByID(_ context.Context, id string) (*domain.CatalogItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, item := range s.catalogItems {
		if item.ID == id {
			result := cloneCatalogItem(item)
			return &result, nil
		}
	}
	return nil, nil
}

// CatalogItemCostHistory returns the item's current price as a single open
// record. The fixture store does not model historical price periods (that is a
// SQLite-only concern), so it reports just the present value.
func (s *FixtureStore) CatalogItemCostHistory(
	_ context.Context,
	catalogItemID string,
) ([]domain.CatalogItemCost, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, item := range s.catalogItems {
		if item.ID == catalogItemID {
			from := item.CreatedAt
			if from == "" {
				from = time.Now().UTC().Format("2006-01-02")
			} else if len(from) >= 10 {
				from = from[:10]
			}
			return []domain.CatalogItemCost{{
				ID:            "cph-" + item.ID,
				CatalogItemID: item.ID,
				PurchasePrice: item.PurchasePrice,
				SalePrice:     item.SalePrice,
				EffectiveFrom: from,
				EffectiveTo:   nil,
				CreatedAt:     item.CreatedAt,
			}}, nil
		}
	}
	return []domain.CatalogItemCost{}, nil
}

// UpsertCatalogItem creates or replaces an item in the in-memory catalog. The
// fixture store keeps a single current price (no effective-dated history), so
// effectiveFrom is accepted for interface parity and ignored — future-dating is
// a SQLite-only concern exercised against SQLiteStore.
func (s *FixtureStore) UpsertCatalogItem(
	_ context.Context,
	item domain.CatalogItem,
	_ string,
) (*domain.CatalogItem, error) {
	normalized, err := normalizeCatalogItem(item)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, existing := range s.catalogItems {
		if existing.ID != normalized.ID && existing.Code == normalized.Code {
			return nil, newValidationError("Artikal sa istom šifrom već postoji.")
		}
	}
	for index, existing := range s.catalogItems {
		if existing.ID == normalized.ID {
			normalized.CreatedAt = existing.CreatedAt
			s.catalogItems[index] = normalized
			result := cloneCatalogItem(normalized)
			return &result, nil
		}
	}
	s.catalogItems = append(s.catalogItems, normalized)
	result := cloneCatalogItem(normalized)
	return &result, nil
}

// DeleteCatalogItem removes an item from the in-memory catalog.
func (s *FixtureStore) DeleteCatalogItem(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	remaining := make([]domain.CatalogItem, 0, len(s.catalogItems))
	for _, existing := range s.catalogItems {
		if existing.ID != id {
			remaining = append(remaining, existing)
		}
	}
	s.catalogItems = remaining
	return nil
}

// catalogPurchasePricesLocked returns purchase (cost) prices keyed by catalog
// item id for the given ids. The caller must already hold s.mu (work-order
// create/update run under the store lock).
func (s *FixtureStore) catalogPurchasePricesLocked(ids []string) map[string]float64 {
	want := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		want[id] = struct{}{}
	}
	prices := make(map[string]float64, len(ids))
	for _, item := range s.catalogItems {
		if _, ok := want[item.ID]; !ok {
			continue
		}
		if item.PurchasePrice != nil {
			prices[item.ID] = *item.PurchasePrice
		}
	}
	return prices
}

func cloneCatalogItem(item domain.CatalogItem) domain.CatalogItem {
	cloned := item
	cloned.PurchasePrice = clonePtrFloat64(item.PurchasePrice)
	cloned.SalePrice = clonePtrFloat64(item.SalePrice)
	cloned.Barcode = clonePtrString(item.Barcode)
	cloned.TaxGroup = clonePtrString(item.TaxGroup)
	cloned.Description = clonePtrString(item.Description)
	return cloned
}
