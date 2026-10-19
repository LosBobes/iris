package store

import (
	"sort"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Warehouse stock shared by the SQLite and fixture stores: query types, level
// assembly and the small pure helpers around the posting math in
// domain/stock.go.

// StockLevelQuery filters and paginates the stock list. Limit <= 0 means no
// limit.
type StockLevelQuery struct {
	Search  string
	LowOnly bool
	Limit   int
	Offset  int
}

// StockMovementQuery filters and paginates the movement ledger (newest first).
// Limit <= 0 means no limit.
type StockMovementQuery struct {
	CatalogItemID string
	WorkOrderID   string
	Limit         int
	Offset        int
}

// stockArticleRow is one article with its ledger totals, before reservations.
type stockArticleRow struct {
	item           domain.CatalogItem
	onHand         float64
	lastMovementAt *string
	hasMovements   bool
}

// isClosedWorkOrderStatus reports statuses whose process no longer reserves stock.
func isClosedWorkOrderStatus(status domain.WorkOrderStatus) bool {
	switch status {
	case domain.WorkOrderStatusCompleted, domain.WorkOrderStatusCancelled, domain.WorkOrderStatusInvoiced:
		return true
	}
	return false
}

// closedWorkOrderStatusesSQL is the SQL list matching isClosedWorkOrderStatus.
const closedWorkOrderStatusesSQL = `('completed', 'cancelled', 'invoiced')`

// sumReserved adds a graph's planned inputs (scaled by the order's quantity
// factor) to the per-article totals.
func sumReserved(into map[string]float64, graph domain.ProcessGraph, factor float64) {
	for id, quantity := range domain.ReservedInputs(graph, factor) {
		into[id] += quantity
	}
}

func stockSearchKey(value string) string {
	return strings.ToLower(foldDiacritics(strings.TrimSpace(value)))
}

// buildStockLevelList turns article rows into the filtered, ordered and paged
// stock list. Rows are expected for kind "article" only; inactive articles are
// listed only while they hold stock.
func buildStockLevelList(rows []stockArticleRow, reserved map[string]float64, query StockLevelQuery) domain.StockLevelList {
	search := stockSearchKey(query.Search)
	levels := make([]domain.StockLevel, 0, len(rows))
	for _, row := range rows {
		item := row.item
		if !item.IsActive && row.onHand > -domain.StockEpsilon && row.onHand < domain.StockEpsilon {
			continue
		}
		if search != "" &&
			!strings.Contains(stockSearchKey(item.Name), search) &&
			!strings.Contains(stockSearchKey(item.Code), search) {
			continue
		}
		held := reserved[item.ID]
		level := domain.StockLevel{
			CatalogItemID:  item.ID,
			Code:           item.Code,
			Name:           item.Name,
			Unit:           item.Unit,
			IsActive:       item.IsActive,
			OnHand:         row.onHand,
			Reserved:       held,
			Available:      row.onHand - held,
			MinStock:       clonePtrFloat64(item.MinStock),
			LastMovementAt: clonePtrString(row.lastMovementAt),
		}
		level.Low = domain.StockLow(level.OnHand, level.Available, level.MinStock)
		if query.LowOnly && !level.Low {
			continue
		}
		levels = append(levels, level)
	}
	sort.SliceStable(levels, func(i, j int) bool {
		if levels[i].IsActive != levels[j].IsActive {
			return levels[i].IsActive
		}
		return strings.ToLower(levels[i].Name) < strings.ToLower(levels[j].Name)
	})
	total := len(levels)
	return domain.StockLevelList{Items: pageSlice(levels, query.Limit, query.Offset), Total: total}
}

// pageSlice applies limit/offset (limit <= 0 = everything from offset) and
// always returns a non-nil slice.
func pageSlice[T any](items []T, limit, offset int) []T {
	if offset < 0 {
		offset = 0
	}
	if offset >= len(items) {
		return []T{}
	}
	items = items[offset:]
	if limit > 0 && limit < len(items) {
		items = items[:limit]
	}
	return items
}

// existingLinkSkip returns a link-validation skip function that ignores nodes
// that are stored unchanged in current (same id, catalogItemId and unit), so a
// link that went stale later (for example an article deleted) never blocks
// unrelated edits. Changing the link or the unit re-validates the node.
func existingLinkSkip(current domain.ProcessGraph) func(domain.ProcessNode) bool {
	stored := make(map[[3]string]bool, len(current.Nodes))
	for _, node := range current.Nodes {
		if node.CatalogItemID != "" {
			stored[[3]string{node.ID, node.CatalogItemID, node.Unit}] = true
		}
	}
	return func(node domain.ProcessNode) bool {
		return stored[[3]string{node.ID, node.CatalogItemID, node.Unit}]
	}
}

// receiptLineIDs trims the ids of a validated receipt.
func normalizeReceipt(input domain.StockReceiptInput) (domain.StockReceiptInput, error) {
	if message := domain.ValidateStockReceipt(input); message != "" {
		return input, newValidationError(message)
	}
	out := domain.StockReceiptInput{
		DocumentRef: strings.TrimSpace(input.DocumentRef),
		Note:        strings.TrimSpace(input.Note),
		Lines:       make([]domain.StockReceiptLine, len(input.Lines)),
	}
	for i, line := range input.Lines {
		out.Lines[i] = domain.StockReceiptLine{CatalogItemID: strings.TrimSpace(line.CatalogItemID), Quantity: line.Quantity}
	}
	return out, nil
}

func normalizeCount(input domain.StockCountInput) (domain.StockCountInput, error) {
	if message := domain.ValidateStockCount(input); message != "" {
		return input, newValidationError(message)
	}
	out := domain.StockCountInput{
		Note:  strings.TrimSpace(input.Note),
		Lines: make([]domain.StockCountLine, len(input.Lines)),
	}
	for i, line := range input.Lines {
		out.Lines[i] = domain.StockCountLine{CatalogItemID: strings.TrimSpace(line.CatalogItemID), CountedQuantity: line.CountedQuantity}
	}
	return out, nil
}

func optionalText(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
