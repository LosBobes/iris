package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// In-memory warehouse ledger for the fixture store. Like the other fixture
// data it models a single shop, so nothing here is tenant-partitioned.

func (s *FixtureStore) catalogItemLocked(id string) (domain.CatalogItem, bool) {
	for _, item := range s.catalogItems {
		if item.ID == id {
			return item, true
		}
	}
	return domain.CatalogItem{}, false
}

func (s *FixtureStore) articleLocked(id string) (domain.CatalogItem, bool) {
	item, ok := s.catalogItemLocked(id)
	if !ok || item.Kind != domain.CatalogItemKindArticle {
		return domain.CatalogItem{}, false
	}
	return item, true
}

// stockTotalsLocked returns an article's balance and movement count.
func (s *FixtureStore) stockTotalsLocked(id string) (onHand float64, count int) {
	for _, movement := range s.stockMovements {
		if movement.CatalogItemID == id {
			onHand += movement.Quantity
			count++
		}
	}
	return onHand, count
}

func (s *FixtureStore) hasStockMovementsLocked(id string) bool {
	_, count := s.stockTotalsLocked(id)
	return count > 0
}

// withStockLocked clones an item and fills the computed stock balance.
func (s *FixtureStore) withStockLocked(item domain.CatalogItem) domain.CatalogItem {
	cloned := cloneCatalogItem(item)
	cloned.StockOnHand = nil
	if item.Kind == domain.CatalogItemKindArticle {
		onHand, _ := s.stockTotalsLocked(item.ID)
		cloned.StockOnHand = &onHand
	}
	return cloned
}

func (s *FixtureStore) resolveGraphLinksLocked(graph domain.ProcessGraph, skip func(domain.ProcessNode) bool) (domain.ProcessGraph, error) {
	if !s.modules.Stock {
		return graph, nil // links are inert while the stock module is off
	}
	resolved, err := domain.ResolveGraphArticleLinks(graph, func(id string) (domain.StockArticle, bool) {
		item, ok := s.articleLocked(id)
		return domain.StockArticle{ID: item.ID, Name: item.Name, Unit: item.Unit}, ok
	}, skip)
	if err != nil {
		return domain.ProcessGraph{}, graphValidationError(err)
	}
	return resolved, nil
}

func (s *FixtureStore) appendMovementLocked(
	article domain.CatalogItem, kind domain.StockMovementKind, quantity float64,
	workOrderID, processNodeID, documentRef, note *string, username, now string,
) domain.StockMovement {
	s.nextStockSequence++
	movement := domain.StockMovement{
		ID:            fmt.Sprintf("mov-%d", s.nextStockSequence),
		CatalogItemID: article.ID,
		Kind:          kind,
		Quantity:      quantity,
		WorkOrderID:   clonePtrString(workOrderID),
		ProcessNodeID: clonePtrString(processNodeID),
		DocumentRef:   clonePtrString(documentRef),
		Note:          clonePtrString(note),
		CreatedAt:     now,
		CreatedBy:     username,
	}
	s.stockMovements = append(s.stockMovements, movement)
	return s.decorateMovementLocked(movement)
}

// decorateMovementLocked fills the article and work-order details of a ledger row.
func (s *FixtureStore) decorateMovementLocked(movement domain.StockMovement) domain.StockMovement {
	movement.WorkOrderID = clonePtrString(movement.WorkOrderID)
	movement.ProcessNodeID = clonePtrString(movement.ProcessNodeID)
	movement.DocumentRef = clonePtrString(movement.DocumentRef)
	movement.Note = clonePtrString(movement.Note)
	movement.WorkOrderNumber = nil
	if item, ok := s.catalogItemLocked(movement.CatalogItemID); ok {
		movement.ItemCode, movement.ItemName, movement.Unit = item.Code, item.Name, item.Unit
	}
	if movement.WorkOrderID != nil {
		for _, order := range s.workOrders {
			if order.ID == *movement.WorkOrderID {
				number := order.OrderNumber
				movement.WorkOrderNumber = &number
				break
			}
		}
	}
	return movement
}

// postWorkOrderStockLocked mirrors postWorkOrderStock for the fixture store.
func (s *FixtureStore) postWorkOrderStockLocked(workOrderID string, graph domain.ProcessGraph, username, now string) {
	existing := map[domain.StockNodeKey]float64{}
	for _, movement := range s.stockMovements {
		if movement.WorkOrderID != nil && *movement.WorkOrderID == workOrderID && movement.ProcessNodeID != nil {
			existing[domain.StockNodeKey{NodeID: *movement.ProcessNodeID, CatalogItemID: movement.CatalogItemID}] += movement.Quantity
		}
	}
	for _, planned := range domain.PlanStockPostings(graph, existing) {
		article, ok := s.articleLocked(planned.CatalogItemID)
		if !ok {
			continue
		}
		s.appendMovementLocked(article, planned.Kind, planned.Quantity, &workOrderID, stringPtr(planned.NodeID), nil, nil, username, now)
	}
}

func (s *FixtureStore) openReservationsLocked() map[string]float64 {
	reserved := map[string]float64{}
	if s.ensureWorkOrdersLoaded() != nil {
		return reserved
	}
	for _, order := range s.workOrders {
		if isClosedWorkOrderStatus(order.Status) {
			continue
		}
		if process, ok := s.workOrderProcesses[order.ID]; ok && s.stockTracked[order.ID] {
			sumReserved(reserved, process.Graph)
		}
	}
	return reserved
}

func (s *FixtureStore) StockLevels(_ context.Context, query StockLevelQuery) (domain.StockLevelList, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows := make([]stockArticleRow, 0)
	for _, item := range s.catalogItems {
		if item.Kind != domain.CatalogItemKindArticle {
			continue
		}
		row := stockArticleRow{item: item}
		for _, movement := range s.stockMovements {
			if movement.CatalogItemID != item.ID {
				continue
			}
			row.onHand += movement.Quantity
			row.hasMovements = true
			if row.lastMovementAt == nil || movement.CreatedAt >= *row.lastMovementAt {
				at := movement.CreatedAt
				row.lastMovementAt = &at
			}
		}
		rows = append(rows, row)
	}
	return buildStockLevelList(rows, s.openReservationsLocked(), query), nil
}

func (s *FixtureStore) StockMovements(_ context.Context, query StockMovementQuery) (domain.StockMovementList, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = s.ensureWorkOrdersLoaded()
	itemID, orderID := strings.TrimSpace(query.CatalogItemID), strings.TrimSpace(query.WorkOrderID)
	matched := make([]domain.StockMovement, 0)
	// Newest first: the ledger is append-only, so reverse insertion order.
	for i := len(s.stockMovements) - 1; i >= 0; i-- {
		movement := s.stockMovements[i]
		if itemID != "" && movement.CatalogItemID != itemID {
			continue
		}
		if orderID != "" && (movement.WorkOrderID == nil || *movement.WorkOrderID != orderID) {
			continue
		}
		matched = append(matched, s.decorateMovementLocked(movement))
	}
	// Stable by created_at desc keeps same-second rows in reverse insertion order.
	sortMovementsNewestFirst(matched)
	total := len(matched)
	return domain.StockMovementList{Items: pageSlice(matched, query.Limit, query.Offset), Total: total}, nil
}

func sortMovementsNewestFirst(movements []domain.StockMovement) {
	for i := 1; i < len(movements); i++ {
		for j := i; j > 0 && movements[j].CreatedAt > movements[j-1].CreatedAt; j-- {
			movements[j], movements[j-1] = movements[j-1], movements[j]
		}
	}
}

func (s *FixtureStore) PostStockReceipt(_ context.Context, input domain.StockReceiptInput, username string) (domain.StockPostingResult, error) {
	input, err := normalizeReceipt(input)
	if err != nil {
		return domain.StockPostingResult{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	articles := make([]domain.CatalogItem, len(input.Lines))
	for i, line := range input.Lines {
		article, ok := s.articleLocked(line.CatalogItemID)
		if !ok {
			return domain.StockPostingResult{}, newValidationError(domain.StockArticleNotFoundMessage)
		}
		articles[i] = article
	}
	now := time.Now().UTC().Format(time.RFC3339)
	documentRef, note := optionalText(input.DocumentRef), optionalText(input.Note)
	movements := make([]domain.StockMovement, 0, len(input.Lines))
	for i, line := range input.Lines {
		movements = append(movements, s.appendMovementLocked(
			articles[i], domain.StockMovementReceipt, line.Quantity, nil, nil, documentRef, note, username, now,
		))
	}
	return domain.StockPostingResult{Movements: movements}, nil
}

func (s *FixtureStore) PostStockCount(_ context.Context, input domain.StockCountInput, username string) (domain.StockPostingResult, error) {
	input, err := normalizeCount(input)
	if err != nil {
		return domain.StockPostingResult{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	articles := make([]domain.CatalogItem, len(input.Lines))
	for i, line := range input.Lines {
		article, ok := s.articleLocked(line.CatalogItemID)
		if !ok {
			return domain.StockPostingResult{}, newValidationError(domain.StockArticleNotFoundMessage)
		}
		articles[i] = article
	}
	now := time.Now().UTC().Format(time.RFC3339)
	note := optionalText(input.Note)
	movements := make([]domain.StockMovement, 0, len(input.Lines))
	for i, line := range input.Lines {
		onHand, count := s.stockTotalsLocked(articles[i].ID)
		delta := line.CountedQuantity - onHand
		if delta > -domain.StockEpsilon && delta < domain.StockEpsilon {
			continue
		}
		kind := domain.StockMovementAdjustment
		if count == 0 {
			kind = domain.StockMovementOpening
		}
		movements = append(movements, s.appendMovementLocked(articles[i], kind, delta, nil, nil, nil, note, username, now))
	}
	return domain.StockPostingResult{Movements: movements}, nil
}
