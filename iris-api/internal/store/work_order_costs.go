package store

import "github.com/LosBobes/iris/iris-api/internal/domain"

// Event kinds and labels for the ad-hoc cost-review workflow. An order with any
// line whose cost is not yet captured (UnitCost == nil) raises a cost_review
// event and surfaces in the admin queue; once an admin fills the missing costs,
// a cost_captured event is appended.
const (
	eventKindCostReview   = "cost_review"
	eventKindCostCaptured = "cost_captured"

	eventLabelCostReview   = "Čeka unos troška"
	eventLabelCostCaptured = "Trošak unet"
)

// costCaptureMode selects how line-item costs are (re)captured when a work order
// is saved. Costs are frozen onto the order so later catalog price changes don't
// rewrite historical profit.
type costCaptureMode int

const (
	// costModeCreate freezes catalog-line costs from the cost in effect at the
	// order's issue date (passed in via the costs map).
	costModeCreate costCaptureMode = iota
	// costModeCompletion re-snapshots catalog-line costs from the cost in effect
	// at the completion date — the final authoritative value.
	costModeCompletion
	// costModePreserve keeps already-captured costs on existing lines untouched
	// and only captures cost for genuinely new catalog lines.
	costModePreserve
)

// catalogItemIDs collects the distinct catalog item ids referenced by the given
// line items so the store can look up their costs in one query.
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

// applyLineItemCosts captures each line's per-unit cost and returns the updated
// lines, the cached profit (sum over cost-known lines of (unitPrice-cost)*qty),
// and whether any line still lacks a cost (needsCostReview).
//
//   - costs maps catalog item id -> cost effective on the relevant date.
//   - prior is the order's line items before this save (nil on create); it lets
//     preserve-mode keep frozen costs and protects an admin-entered ad-hoc cost
//     from being wiped by a later operator edit that omits it.
//
// Catalog lines take their cost from costs (create/completion) or keep the
// frozen value (preserve, existing line). Ad-hoc lines (no catalog link) keep an
// explicit incoming cost, else fall back to the previously captured cost, else
// remain nil — which flags the order for admin review without blocking the save.
func applyLineItemCosts(
	items []domain.InvoiceLineItem,
	costs map[string]float64,
	prior []domain.InvoiceLineItem,
	mode costCaptureMode,
) ([]domain.InvoiceLineItem, *float64, bool) {
	priorCost := make(map[string]*float64, len(prior))
	for _, p := range prior {
		priorCost[p.ID] = p.UnitCost
	}

	var profit float64
	needsReview := false
	for i := range items {
		line := &items[i]
		prev, existed := priorCost[line.ID]
		isCatalog := line.CatalogItemID != nil && *line.CatalogItemID != ""

		var cost *float64
		switch {
		case isCatalog && mode == costModePreserve && existed && prev != nil:
			cost = prev // freeze: keep the cost captured at creation
		case isCatalog:
			// Catalog price history is authoritative when it has a cost for the
			// item. When it does not (no cost on record), an admin may fill the
			// gap by entering a cost on the line; fall back to that, then to any
			// previously captured value, else leave it for review. This keeps
			// priced catalog lines untouched while making the "—" case editable.
			cost = catalogCostPtr(costs, *line.CatalogItemID)
			if cost == nil {
				switch {
				case line.UnitCost != nil:
					cost = line.UnitCost
				case existed:
					cost = prev
				}
			}
		case line.UnitCost != nil:
			cost = line.UnitCost // ad-hoc with an explicit (admin-entered) cost
		case existed:
			cost = prev // ad-hoc: keep prior captured cost (don't let edits wipe it)
		default:
			cost = nil // ad-hoc, never costed → needs admin review
		}

		line.UnitCost = cost
		if cost == nil {
			needsReview = true
		} else {
			profit += (line.UnitPrice - *cost) * float64(line.Quantity)
		}
	}
	return items, &profit, needsReview
}

func catalogCostPtr(costs map[string]float64, id string) *float64 {
	if v, ok := costs[id]; ok {
		c := v
		return &c
	}
	return nil
}

// applyCostReviewEvents appends a cost_review or cost_captured event when the
// order crosses the cost-review boundary (was/now needing review), and returns
// the possibly-extended event slice. actor labels who triggered the change.
func applyCostReviewEvents(
	events []domain.WorkOrderEvent,
	wasNeeded, nowNeeded bool,
	actor, timestamp string,
) []domain.WorkOrderEvent {
	switch {
	case !wasNeeded && nowNeeded:
		return append(events, domain.WorkOrderEvent{
			ID:        "event-cost-review-" + timestamp,
			Kind:      eventKindCostReview,
			Label:     eventLabelCostReview,
			Actor:     actor,
			CreatedAt: timestamp,
		})
	case wasNeeded && !nowNeeded:
		return append(events, domain.WorkOrderEvent{
			ID:        "event-cost-captured-" + timestamp,
			Kind:      eventKindCostCaptured,
			Label:     eventLabelCostCaptured,
			Actor:     actor,
			CreatedAt: timestamp,
		})
	default:
		return events
	}
}
