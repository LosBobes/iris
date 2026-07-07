package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// dbExecQuerier is the subset of *sql.DB / *sql.Tx the cost-history helpers need,
// so recordCatalogCost can run inside the UpsertCatalogItem transaction.
type dbExecQuerier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// recordCatalogCost appends an effective-dated cost record for a catalog item
// when its price changed, keeping the history append-only. The newly-effective
// record is stamped effective_from = today and the previous open record is
// closed (effective_to = today). A same-day re-edit updates the open record in
// place rather than creating a second record for the same day. When the item has
// no history yet (a freshly created item) the first open record is inserted.
func recordCatalogCost(
	ctx context.Context,
	q dbExecQuerier,
	catalogItemID string,
	purchase, sale *float64,
	today string,
) error {
	var (
		curID       string
		curFrom     string
		curPurchase sql.NullFloat64
		curSale     sql.NullFloat64
	)
	err := q.QueryRowContext(
		ctx,
		`SELECT id, effective_from, purchase_price, sale_price
		   FROM catalog_item_price_history
		  WHERE catalog_item_id = ? AND effective_to IS NULL
		  ORDER BY effective_from DESC LIMIT 1`,
		catalogItemID,
	).Scan(&curID, &curFrom, &curPurchase, &curSale)

	switch {
	case err == sql.ErrNoRows:
		// No history yet — seed the first open record.
		return insertCostRecord(ctx, q, catalogItemID, purchase, sale, today)
	case err != nil:
		return fmt.Errorf("load current catalog cost: %w", err)
	}

	if nullFloatEqualsPtr(curPurchase, purchase) && nullFloatEqualsPtr(curSale, sale) {
		return nil // unchanged — nothing to record
	}

	if curFrom == today {
		// Same-day correction: update the open record in place.
		if _, err := q.ExecContext(
			ctx,
			`UPDATE catalog_item_price_history SET purchase_price = ?, sale_price = ? WHERE id = ?`,
			ptrFloatValue(purchase), ptrFloatValue(sale), curID,
		); err != nil {
			return fmt.Errorf("update catalog cost record: %w", err)
		}
		return nil
	}

	// Close the prior period and open a new one effective today.
	if _, err := q.ExecContext(
		ctx,
		`UPDATE catalog_item_price_history SET effective_to = ? WHERE id = ?`,
		today, curID,
	); err != nil {
		return fmt.Errorf("close catalog cost record: %w", err)
	}
	return insertCostRecord(ctx, q, catalogItemID, purchase, sale, today)
}

func insertCostRecord(
	ctx context.Context,
	q dbExecQuerier,
	catalogItemID string,
	purchase, sale *float64,
	today string,
) error {
	id, err := newCostHistoryID()
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := q.ExecContext(
		ctx,
		`INSERT INTO catalog_item_price_history
		   (id, catalog_item_id, purchase_price, sale_price, effective_from, effective_to, created_at)
		 VALUES (?, ?, ?, ?, ?, NULL, ?)`,
		id, catalogItemID, ptrFloatValue(purchase), ptrFloatValue(sale), today, now,
	); err != nil {
		return fmt.Errorf("insert catalog cost record: %w", err)
	}
	return nil
}

// catalogCostsAsOf returns the purchase (cost) price effective on the given date
// for each catalog item id — the latest history record whose effective_from is
// on or before the date. When an item has no record on/before the date (e.g. an
// order back-dated before the item's first known cost), it falls back to the
// item's earliest record, the best available estimate. Items whose effective
// cost is NULL are omitted (treated as unknown by the caller).
func (s *SQLiteStore) catalogCostsAsOf(
	ctx context.Context,
	ids []string,
	date string,
) (map[string]float64, error) {
	costs := make(map[string]float64, len(ids))
	if len(ids) == 0 {
		return costs, nil
	}
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	placeholders := make([]string, len(ids))
	args := make([]any, 0, len(ids)+3)
	args = append(args, date, date)
	for i, id := range ids {
		placeholders[i] = "?"
		args = append(args, id)
	}
	// Restrict to the tenant's own catalog items so a crafted work-order payload
	// cannot pull another tenant's cost prices.
	args = append(args, tenantID)

	// Rank each item's records: those effective on/before the date first (latest
	// of them), otherwise the earliest record as a fallback. rn = 1 is the pick.
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT catalog_item_id, purchase_price FROM (
		   SELECT catalog_item_id, purchase_price,
		          ROW_NUMBER() OVER (
		            PARTITION BY catalog_item_id
		            ORDER BY (effective_from <= ?) DESC,
		                     CASE WHEN effective_from <= ? THEN effective_from END DESC,
		                     effective_from ASC
		          ) AS rn
		     FROM catalog_item_price_history
		    WHERE catalog_item_id IN (`+strings.Join(placeholders, ",")+`)
		      AND catalog_item_id IN (SELECT id FROM catalog_items WHERE tenant_id = ?)
		 ) WHERE rn = 1`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("load catalog costs as of %s: %w", date, err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var price sql.NullFloat64
		if err := rows.Scan(&id, &price); err != nil {
			return nil, fmt.Errorf("scan catalog cost: %w", err)
		}
		if price.Valid {
			costs[id] = price.Float64
		}
	}
	return costs, rows.Err()
}

// CatalogItemCostHistory returns an item's cost records, newest period first,
// for the admin catalog-detail view.
func (s *SQLiteStore) CatalogItemCostHistory(
	ctx context.Context,
	catalogItemID string,
) ([]domain.CatalogItemCost, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, catalog_item_id, purchase_price, sale_price, effective_from, effective_to, created_at
		   FROM catalog_item_price_history
		  WHERE catalog_item_id = ?
		    AND catalog_item_id IN (SELECT id FROM catalog_items WHERE tenant_id = ?)
		  ORDER BY effective_from DESC`,
		catalogItemID,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list catalog cost history: %w", err)
	}
	defer rows.Close()
	history := make([]domain.CatalogItemCost, 0)
	for rows.Next() {
		var (
			rec      domain.CatalogItemCost
			purchase sql.NullFloat64
			sale     sql.NullFloat64
			to       sql.NullString
		)
		if err := rows.Scan(
			&rec.ID, &rec.CatalogItemID, &purchase, &sale,
			&rec.EffectiveFrom, &to, &rec.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan catalog cost history: %w", err)
		}
		if purchase.Valid {
			rec.PurchasePrice = &purchase.Float64
		}
		if sale.Valid {
			rec.SalePrice = &sale.Float64
		}
		rec.EffectiveTo = nullStringPtr(to)
		history = append(history, rec)
	}
	return history, rows.Err()
}

func nullFloatEqualsPtr(a sql.NullFloat64, b *float64) bool {
	if !a.Valid {
		return b == nil
	}
	return b != nil && a.Float64 == *b
}

func newCostHistoryID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create cost history id: %w", err)
	}
	return "cph-" + hex.EncodeToString(raw[:]), nil
}
