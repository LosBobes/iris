package store

import "github.com/LosBobes/iris/iris-api/internal/domain"

// catalogItemIDs collects the distinct catalog item ids referenced by the given
// line items so the store can look up their purchase prices in one query.
func catalogItemIDs(items []domain.InvoiceLineItem) []string {
	seen := make(map[string]struct{}, len(items))
	ids := make([]string, 0, len(items))
	for _, item := range items {
		if item.CatalogItemID == nil || *item.CatalogItemID == "" {
			continue
		}
		if _, ok := seen[*item.CatalogItemID]; ok {
			continue
		}
		seen[*item.CatalogItemID] = struct{}{}
		ids = append(ids, *item.CatalogItemID)
	}
	return ids
}

// applyLineItemCosts captures the per-unit cost on each catalog-linked line from
// purchasePrices (keyed by catalog item id) and returns the cached profit: the
// sum over lines of (unitPrice-unitCost)*quantity. Costs are captured at save
// time so the cached profit survives later catalog price changes. Ad-hoc lines
// without a catalog link keep a zero cost. The returned pointer is never nil so
// the cached profit is always explicit, including the zero case.
func applyLineItemCosts(
	items []domain.InvoiceLineItem,
	purchasePrices map[string]float64,
) ([]domain.InvoiceLineItem, *float64) {
	var profit float64
	for i := range items {
		cost := 0.0
		if items[i].CatalogItemID != nil {
			if price, ok := purchasePrices[*items[i].CatalogItemID]; ok {
				cost = price
			}
		}
		items[i].UnitCost = cost
		profit += (items[i].UnitPrice - cost) * float64(items[i].Quantity)
	}
	return items, &profit
}
