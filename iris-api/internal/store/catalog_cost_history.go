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

// recordCatalogCost records an effective-dated price change for a catalog item,
// keeping the history append-only. effectiveFrom is the date the new price takes
// effect (today or a future date; callers default "" to today upstream); today
// is the server's current date.
//
// Behaviour:
//   - Unchanged price + effectiveFrom == today: no-op. This protects operator
//     kind-only edits and other incidental re-saves — crucially, a pending future
//     schedule is left intact.
//   - Changed price, effectiveFrom == today (immediate): supersede any pending
//     future schedule, then either update the current period in place (same-day
//     correction) or close it today and open a new period from today.
//   - Changed price, effectiveFrom > today (scheduled): supersede any pending
//     future schedule, close the current period at effectiveFrom, and open a new
//     period from effectiveFrom. The item's currently-effective price is left
//     untouched until that date arrives (resolved on read via catalogPricesAsOf).
//
// "Current" means the record effective as of today (latest effective_from <=
// today), never a not-yet-effective future record.
func recordCatalogCost(
	ctx context.Context,
	q dbExecQuerier,
	catalogItemID string,
	purchase, sale *float64,
	effectiveFrom, today string,
) error {
	if effectiveFrom == "" {
		effectiveFrom = today
	}
	isFuture := effectiveFrom > today // YYYY-MM-DD compares lexicographically

	curID, curFrom, curPurchase, curSale, curFound, err := currentCostRecord(ctx, q, catalogItemID, today)
	if err != nil {
		return err
	}

	priceChanged := !curFound ||
		!nullFloatEqualsPtr(curPurchase, purchase) ||
		!nullFloatEqualsPtr(curSale, sale)

	if !priceChanged && !isFuture {
		// No-op save / operator kind edit: leave everything, including any pending
		// future schedule, untouched.
		return nil
	}

	// From here we mutate history, so first supersede any not-yet-effective
	// schedule and heal the (possibly future-closed) current period.
	if err := supersedeFutureCostRecords(ctx, q, catalogItemID, today); err != nil {
		return err
	}
	if !priceChanged {
		// A future save whose price equals the current one: nothing to schedule.
		return nil
	}

	// Re-read the current record after healing (supersede may have re-opened it).
	curID, curFrom, _, _, curFound, err = currentCostRecord(ctx, q, catalogItemID, today)
	if err != nil {
		return err
	}
	if !curFound {
		// No current period yet (brand-new item): seed the first record.
		return insertCostRecord(ctx, q, catalogItemID, purchase, sale, effectiveFrom)
	}

	if isFuture {
		// Close the current period at the future boundary and schedule the new one.
		if _, err := q.ExecContext(
			ctx,
			`UPDATE catalog_item_price_history SET effective_to = ? WHERE id = ?`,
			effectiveFrom, curID,
		); err != nil {
			return fmt.Errorf("close catalog cost record: %w", err)
		}
		return insertCostRecord(ctx, q, catalogItemID, purchase, sale, effectiveFrom)
	}

	if curFrom == today {
		// Same-day correction: update the current period in place.
		if _, err := q.ExecContext(
			ctx,
			`UPDATE catalog_item_price_history SET purchase_price = ?, sale_price = ? WHERE id = ?`,
			ptrFloatValue(purchase), ptrFloatValue(sale), curID,
		); err != nil {
			return fmt.Errorf("update catalog cost record: %w", err)
		}
		return nil
	}

	// Close the prior period today and open a new one effective today.
	if _, err := q.ExecContext(
		ctx,
		`UPDATE catalog_item_price_history SET effective_to = ? WHERE id = ?`,
		today, curID,
	); err != nil {
		return fmt.Errorf("close catalog cost record: %w", err)
	}
	return insertCostRecord(ctx, q, catalogItemID, purchase, sale, today)
}

// currentCostRecord loads the record effective as of today (the latest
// effective_from on or before today), ignoring not-yet-effective future records.
// found is false when the item has no such record yet.
func currentCostRecord(
	ctx context.Context,
	q dbExecQuerier,
	catalogItemID, today string,
) (id, from string, purchase, sale sql.NullFloat64, found bool, err error) {
	scanErr := q.QueryRowContext(
		ctx,
		`SELECT id, effective_from, purchase_price, sale_price
		   FROM catalog_item_price_history
		  WHERE catalog_item_id = ? AND effective_from <= ?
		  ORDER BY effective_from DESC LIMIT 1`,
		catalogItemID, today,
	).Scan(&id, &from, &purchase, &sale)
	switch {
	case scanErr == sql.ErrNoRows:
		return "", "", sql.NullFloat64{}, sql.NullFloat64{}, false, nil
	case scanErr != nil:
		return "", "", sql.NullFloat64{}, sql.NullFloat64{}, false, fmt.Errorf("load current catalog cost: %w", scanErr)
	}
	return id, from, purchase, sale, true, nil
}

// supersedeFutureCostRecords deletes any not-yet-effective (future) schedule for
// the item and re-opens the now-latest record, healing a current period that a
// deleted future record had closed. This enforces at most one pending change per
// item and makes reschedule/cancel coherent.
func supersedeFutureCostRecords(
	ctx context.Context,
	q dbExecQuerier,
	catalogItemID, today string,
) error {
	if _, err := q.ExecContext(
		ctx,
		`DELETE FROM catalog_item_price_history WHERE catalog_item_id = ? AND effective_from > ?`,
		catalogItemID, today,
	); err != nil {
		return fmt.Errorf("supersede future catalog cost records: %w", err)
	}
	if _, err := q.ExecContext(
		ctx,
		`UPDATE catalog_item_price_history SET effective_to = NULL
		  WHERE id = (
		    SELECT id FROM catalog_item_price_history
		     WHERE catalog_item_id = ? ORDER BY effective_from DESC LIMIT 1
		  )`,
		catalogItemID,
	); err != nil {
		return fmt.Errorf("reopen latest catalog cost record: %w", err)
	}
	return nil
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

// catalogPrice holds the purchase (cost) and sale price effective on a date.
type catalogPrice struct {
	Purchase *float64
	Sale     *float64
}

// catalogPricesAsOf resolves both the purchase and sale price effective on the
// given date for each catalog item id (the latest record with effective_from on
// or before the date, else the earliest as a fallback). This is the read path
// that makes a scheduled future price self-activate on its date without a cron:
// list/detail handlers call it with today so a not-yet-effective record never
// shows as the current price. Tenant-scoped, mirroring catalogCostsAsOf.
func (s *SQLiteStore) catalogPricesAsOf(
	ctx context.Context,
	ids []string,
	date string,
) (map[string]catalogPrice, error) {
	prices := make(map[string]catalogPrice, len(ids))
	if len(ids) == 0 {
		return prices, nil
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
	args = append(args, tenantID)

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT catalog_item_id, purchase_price, sale_price FROM (
		   SELECT catalog_item_id, purchase_price, sale_price,
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
		return nil, fmt.Errorf("load catalog prices as of %s: %w", date, err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var purchase, sale sql.NullFloat64
		if err := rows.Scan(&id, &purchase, &sale); err != nil {
			return nil, fmt.Errorf("scan catalog price: %w", err)
		}
		prices[id] = catalogPrice{Purchase: nullFloatPtr(purchase), Sale: nullFloatPtr(sale)}
	}
	return prices, rows.Err()
}

// applyAsOfPrices overrides each item's cached purchase/sale price with the value
// effective on the given date (resolved from history), so a scheduled future
// change activates at its date and a future price never displays early. Items
// without a resolved record keep their scanned (cached) value.
func (s *SQLiteStore) applyAsOfPrices(
	ctx context.Context,
	items []domain.CatalogItem,
	date string,
) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]string, len(items))
	for i := range items {
		ids[i] = items[i].ID
	}
	prices, err := s.catalogPricesAsOf(ctx, ids, date)
	if err != nil {
		return err
	}
	for i := range items {
		if p, ok := prices[items[i].ID]; ok {
			items[i].PurchasePrice = p.Purchase
			items[i].SalePrice = p.Sale
		}
	}
	return nil
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

func nullFloatPtr(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	f := v.Float64
	return &f
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
