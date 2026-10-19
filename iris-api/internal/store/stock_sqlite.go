package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func newStockMovementID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create stock movement id: %w", err)
	}
	return "mov-" + hex.EncodeToString(raw[:]), nil
}

// stockArticle loads a tenant article for posting; ok is false for unknown ids
// and for services.
func stockArticle(ctx context.Context, q dbExecQuerier, tenantID, id string) (item domain.CatalogItem, ok bool, err error) {
	err = q.QueryRowContext(
		ctx,
		`SELECT id, code, name, unit FROM catalog_items WHERE id = ? AND tenant_id = ? AND kind = 'article'`,
		id, tenantID,
	).Scan(&item.ID, &item.Code, &item.Name, &item.Unit)
	if errors.Is(err, sql.ErrNoRows) {
		return item, false, nil
	}
	if err != nil {
		return item, false, fmt.Errorf("load stock article: %w", err)
	}
	return item, true, nil
}

// resolveGraphLinks validates the catalog links of a process graph against the
// tenant's articles (exists, kind article, unit rule) and fills empty units.
// With the stock module off links are inert: they are kept as-is, unvalidated.
func resolveGraphLinks(
	ctx context.Context, q dbExecQuerier, tenantID string, graph domain.ProcessGraph, skip func(domain.ProcessNode) bool,
) (domain.ProcessGraph, error) {
	modules, err := readModules(ctx, q, tenantID)
	if err != nil {
		return domain.ProcessGraph{}, err
	}
	if !modules.Stock {
		return graph, nil
	}
	articles := map[string]domain.StockArticle{}
	for _, id := range domain.GraphArticleIDs(graph) {
		item, ok, err := stockArticle(ctx, q, tenantID, id)
		if err != nil {
			return domain.ProcessGraph{}, err
		}
		if ok {
			articles[id] = domain.StockArticle{ID: item.ID, Name: item.Name, Unit: item.Unit}
		}
	}
	resolved, err := domain.ResolveGraphArticleLinks(graph, func(id string) (domain.StockArticle, bool) {
		article, ok := articles[id]
		return article, ok
	}, skip)
	if err != nil {
		return domain.ProcessGraph{}, graphValidationError(err)
	}
	return resolved, nil
}

// insertStockMovement writes one ledger row and returns it with article details.
func insertStockMovement(
	ctx context.Context, q dbExecQuerier, tenantID string, article domain.CatalogItem,
	kind domain.StockMovementKind, quantity float64,
	workOrderID, processNodeID, documentRef, note *string, username, now string,
) (domain.StockMovement, error) {
	id, err := newStockMovementID()
	if err != nil {
		return domain.StockMovement{}, err
	}
	if _, err := q.ExecContext(
		ctx,
		`INSERT INTO stock_movements(id, tenant_id, catalog_item_id, kind, quantity, work_order_id, process_node_id, document_ref, note, created_at, created_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, tenantID, article.ID, string(kind), quantity,
		ptrStringValue(workOrderID), ptrStringValue(processNodeID), ptrStringValue(documentRef), ptrStringValue(note), now, username,
	); err != nil {
		return domain.StockMovement{}, fmt.Errorf("insert stock movement: %w", err)
	}
	return domain.StockMovement{
		ID: id, CatalogItemID: article.ID, ItemCode: article.Code, ItemName: article.Name, Unit: article.Unit,
		Kind: kind, Quantity: quantity, WorkOrderID: workOrderID, ProcessNodeID: processNodeID,
		DocumentRef: documentRef, Note: note, CreatedAt: now, CreatedBy: username,
	}, nil
}

// postWorkOrderStock brings the order's posted stock in line with its graph:
// it diffs the desired net per node and article (planned quantities scaled by
// factor, see domain.PlannedQuantityFactor) against the movements already
// posted for that order and inserts one movement per difference.
func postWorkOrderStock(
	ctx context.Context, q dbExecQuerier, tenantID, workOrderID string, graph domain.ProcessGraph, factor float64, username, now string,
) error {
	existing := map[domain.StockNodeKey]float64{}
	rows, err := q.QueryContext(
		ctx,
		`SELECT process_node_id, catalog_item_id, SUM(quantity) FROM stock_movements
		 WHERE tenant_id = ? AND work_order_id = ? AND process_node_id IS NOT NULL
		 GROUP BY process_node_id, catalog_item_id`,
		tenantID, workOrderID,
	)
	if err != nil {
		return fmt.Errorf("load posted stock: %w", err)
	}
	for rows.Next() {
		var key domain.StockNodeKey
		var net float64
		if err := rows.Scan(&key.NodeID, &key.CatalogItemID, &net); err != nil {
			rows.Close()
			return fmt.Errorf("scan posted stock: %w", err)
		}
		existing[key] = net
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	for _, planned := range domain.PlanStockPostings(graph, factor, existing) {
		article, ok, err := stockArticle(ctx, q, tenantID, planned.CatalogItemID)
		if err != nil {
			return err
		}
		if !ok {
			continue // the linked article no longer exists
		}
		if _, err := insertStockMovement(
			ctx, q, tenantID, article, planned.Kind, planned.Quantity,
			&workOrderID, stringPtr(planned.NodeID), nil, nil, username, now,
		); err != nil {
			return err
		}
	}
	return nil
}

func stringPtr(value string) *string { return &value }

// openReservations sums the planned input quantity still to be consumed per
// article over the tenant's open work orders. Per-unit copies are scaled by the
// order's jobDetails.quantity; copies flagged quantities_per_order are not.
func openReservations(ctx context.Context, q dbExecQuerier, tenantID string) (map[string]float64, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT p.graph, p.quantities_per_order, json_extract(w.payload, '$.jobDetails.quantity')
		 FROM work_order_processes p
		 JOIN work_orders w ON w.id = p.work_order_id
		 WHERE p.tenant_id = ? AND w.tenant_id = ? AND p.stock_tracked = 1 AND w.status NOT IN `+closedWorkOrderStatusesSQL+`
		   AND p.graph LIKE '%"catalogItemId"%'`,
		tenantID, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("load open process graphs: %w", err)
	}
	defer rows.Close()
	reserved := map[string]float64{}
	for rows.Next() {
		var raw string
		var perOrder int
		var quantity sql.NullFloat64
		if err := rows.Scan(&raw, &perOrder, &quantity); err != nil {
			return nil, fmt.Errorf("scan process graph: %w", err)
		}
		var orderQuantity *int
		if quantity.Valid {
			whole := int(quantity.Float64)
			orderQuantity = &whole
		}
		perGraph, err := reservedInputsForGraph(raw, domain.PlannedQuantityFactor(orderQuantity, perOrder != 0))
		if err != nil {
			return nil, err
		}
		for id, quantity := range perGraph {
			reserved[id] += quantity
		}
	}
	return reserved, rows.Err()
}

// reservedCache memoizes the planned-input reservation of a process graph keyed
// by the SHA-256 of its raw JSON plus the order's quantity factor. The result
// is a pure function of those two, so a changed graph (different text) or
// order quantity can never hit a stale entry. Keys are
// fixed-size digests (the graph text itself can be large) and the cache is
// bounded by entry count and by the approximate size of the cached results;
// it is simply reset when either limit is reached.
var reservedCache = struct {
	sync.Mutex
	entries map[[sha256.Size]byte]map[string]float64
	bytes   int
}{entries: map[[sha256.Size]byte]map[string]float64{}}

const (
	reservedCacheMaxEntries = 1024
	reservedCacheMaxBytes   = 4 << 20
)

// reservedEntryBytes approximates the memory one cached result holds.
func reservedEntryBytes(perGraph map[string]float64) int {
	size := sha256.Size + 48
	for id := range perGraph {
		size += len(id) + 32
	}
	return size
}

func reservedInputsForGraph(raw string, factor float64) (map[string]float64, error) {
	key := sha256.Sum256([]byte(raw + "\x00" + strconv.FormatFloat(factor, 'g', -1, 64)))
	reservedCache.Lock()
	cached, ok := reservedCache.entries[key]
	reservedCache.Unlock()
	if ok {
		return cached, nil
	}
	graph, err := decodeProcessGraph(raw)
	if err != nil {
		return nil, err
	}
	perGraph := map[string]float64{}
	sumReserved(perGraph, graph, factor)
	size := reservedEntryBytes(perGraph)
	reservedCache.Lock()
	if len(reservedCache.entries) >= reservedCacheMaxEntries || reservedCache.bytes+size > reservedCacheMaxBytes {
		reservedCache.entries = map[[sha256.Size]byte]map[string]float64{}
		reservedCache.bytes = 0
	}
	if _, exists := reservedCache.entries[key]; !exists {
		reservedCache.entries[key] = perGraph
		reservedCache.bytes += size
	}
	reservedCache.Unlock()
	return perGraph, nil
}

// StockLevels lists the tenant's articles with on-hand, reserved and available
// quantities.
func (s *SQLiteStore) StockLevels(ctx context.Context, query StockLevelQuery) (domain.StockLevelList, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.StockLevelList{}, err
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT c.id, c.code, c.name, c.unit, c.is_active, c.min_stock,
		        COALESCE(SUM(m.quantity), 0), MAX(m.created_at), COUNT(m.id)
		 FROM catalog_items c
		 LEFT JOIN stock_movements m ON m.catalog_item_id = c.id AND m.tenant_id = c.tenant_id
		 WHERE c.tenant_id = ? AND c.kind = 'article'
		 GROUP BY c.id`,
		tenantID,
	)
	if err != nil {
		return domain.StockLevelList{}, fmt.Errorf("list stock levels: %w", err)
	}
	var articles []stockArticleRow
	for rows.Next() {
		var row stockArticleRow
		var isActive, movements int
		var minStock sql.NullFloat64
		var last sql.NullString
		if err := rows.Scan(
			&row.item.ID, &row.item.Code, &row.item.Name, &row.item.Unit, &isActive, &minStock,
			&row.onHand, &last, &movements,
		); err != nil {
			rows.Close()
			return domain.StockLevelList{}, fmt.Errorf("scan stock level: %w", err)
		}
		row.item.IsActive = isActive != 0
		if minStock.Valid {
			row.item.MinStock = &minStock.Float64
		}
		row.lastMovementAt = nullStringPtr(last)
		row.hasMovements = movements > 0
		articles = append(articles, row)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return domain.StockLevelList{}, err
	}
	if err := rows.Close(); err != nil {
		return domain.StockLevelList{}, err
	}
	reserved, err := openReservations(ctx, s.db, tenantID)
	if err != nil {
		return domain.StockLevelList{}, err
	}
	return buildStockLevelList(articles, reserved, query), nil
}

// StockMovements lists ledger rows, newest first.
func (s *SQLiteStore) StockMovements(ctx context.Context, query StockMovementQuery) (domain.StockMovementList, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.StockMovementList{}, err
	}
	conditions := []string{"m.tenant_id = ?"}
	args := []any{tenantID}
	if id := strings.TrimSpace(query.CatalogItemID); id != "" {
		conditions = append(conditions, "m.catalog_item_id = ?")
		args = append(args, id)
	}
	if id := strings.TrimSpace(query.WorkOrderID); id != "" {
		conditions = append(conditions, "m.work_order_id = ?")
		args = append(args, id)
	}
	where := " WHERE " + strings.Join(conditions, " AND ")

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stock_movements m`+where, args...).Scan(&total); err != nil {
		return domain.StockMovementList{}, fmt.Errorf("count stock movements: %w", err)
	}
	sqlText := `SELECT m.id, m.catalog_item_id, c.code, c.name, c.unit, m.kind, m.quantity,
	                   m.work_order_id, w.order_number, m.process_node_id, m.document_ref, m.note, m.created_at, m.created_by
	            FROM stock_movements m
	            JOIN catalog_items c ON c.id = m.catalog_item_id
	            LEFT JOIN work_orders w ON w.id = m.work_order_id` + where + `
	            ORDER BY m.created_at DESC, m.rowid DESC`
	if query.Limit > 0 {
		sqlText += " LIMIT ? OFFSET ?"
		args = append(args, query.Limit, maxInt(query.Offset, 0))
	}
	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return domain.StockMovementList{}, fmt.Errorf("list stock movements: %w", err)
	}
	defer rows.Close()
	items := make([]domain.StockMovement, 0)
	for rows.Next() {
		var movement domain.StockMovement
		var kind string
		var workOrderID, orderNumber, nodeID, documentRef, note sql.NullString
		if err := rows.Scan(
			&movement.ID, &movement.CatalogItemID, &movement.ItemCode, &movement.ItemName, &movement.Unit,
			&kind, &movement.Quantity, &workOrderID, &orderNumber, &nodeID, &documentRef, &note,
			&movement.CreatedAt, &movement.CreatedBy,
		); err != nil {
			return domain.StockMovementList{}, fmt.Errorf("scan stock movement: %w", err)
		}
		movement.Kind = domain.StockMovementKind(kind)
		movement.WorkOrderID = nullStringPtr(workOrderID)
		movement.WorkOrderNumber = nullStringPtr(orderNumber)
		movement.ProcessNodeID = nullStringPtr(nodeID)
		movement.DocumentRef = nullStringPtr(documentRef)
		movement.Note = nullStringPtr(note)
		items = append(items, movement)
	}
	if err := rows.Err(); err != nil {
		return domain.StockMovementList{}, err
	}
	return domain.StockMovementList{Items: items, Total: total}, nil
}

// PostStockReceipt records received goods. Unknown ids and services are a
// ValidationError (422); nothing is posted unless every line is valid.
func (s *SQLiteStore) PostStockReceipt(ctx context.Context, input domain.StockReceiptInput, username string) (domain.StockPostingResult, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.StockPostingResult{}, err
	}
	input, err = normalizeReceipt(input)
	if err != nil {
		return domain.StockPostingResult{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.StockPostingResult{}, fmt.Errorf("begin stock receipt: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UTC().Format(time.RFC3339)
	documentRef, note := optionalText(input.DocumentRef), optionalText(input.Note)
	movements := make([]domain.StockMovement, 0, len(input.Lines))
	for _, line := range input.Lines {
		article, ok, err := stockArticle(ctx, tx, tenantID, line.CatalogItemID)
		if err != nil {
			return domain.StockPostingResult{}, err
		}
		if !ok {
			return domain.StockPostingResult{}, newValidationError(domain.StockArticleNotFoundMessage)
		}
		movement, err := insertStockMovement(
			ctx, tx, tenantID, article, domain.StockMovementReceipt, line.Quantity,
			nil, nil, documentRef, note, username, now,
		)
		if err != nil {
			return domain.StockPostingResult{}, err
		}
		movements = append(movements, movement)
	}
	if err := tx.Commit(); err != nil {
		return domain.StockPostingResult{}, fmt.Errorf("commit stock receipt: %w", err)
	}
	return domain.StockPostingResult{Movements: movements}, nil
}

// PostStockCount applies a stock count: each line posts counted minus on-hand
// as an adjustment, or as the opening balance for an article without movements.
// Lines already matching the balance post nothing.
func (s *SQLiteStore) PostStockCount(ctx context.Context, input domain.StockCountInput, username string) (domain.StockPostingResult, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.StockPostingResult{}, err
	}
	input, err = normalizeCount(input)
	if err != nil {
		return domain.StockPostingResult{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.StockPostingResult{}, fmt.Errorf("begin stock count: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UTC().Format(time.RFC3339)
	note := optionalText(input.Note)
	movements := make([]domain.StockMovement, 0, len(input.Lines))
	for _, line := range input.Lines {
		article, ok, err := stockArticle(ctx, tx, tenantID, line.CatalogItemID)
		if err != nil {
			return domain.StockPostingResult{}, err
		}
		if !ok {
			return domain.StockPostingResult{}, newValidationError(domain.StockArticleNotFoundMessage)
		}
		var onHand float64
		var count int
		if err := tx.QueryRowContext(
			ctx,
			`SELECT COALESCE(SUM(quantity), 0), COUNT(*) FROM stock_movements WHERE catalog_item_id = ? AND tenant_id = ?`,
			article.ID, tenantID,
		).Scan(&onHand, &count); err != nil {
			return domain.StockPostingResult{}, fmt.Errorf("read stock on hand: %w", err)
		}
		delta := line.CountedQuantity - onHand
		if delta > -domain.StockEpsilon && delta < domain.StockEpsilon {
			continue
		}
		kind := domain.StockMovementAdjustment
		if count == 0 {
			kind = domain.StockMovementOpening
		}
		movement, err := insertStockMovement(ctx, tx, tenantID, article, kind, delta, nil, nil, nil, note, username, now)
		if err != nil {
			return domain.StockPostingResult{}, err
		}
		movements = append(movements, movement)
	}
	if err := tx.Commit(); err != nil {
		return domain.StockPostingResult{}, fmt.Errorf("commit stock count: %w", err)
	}
	return domain.StockPostingResult{Movements: movements}, nil
}
