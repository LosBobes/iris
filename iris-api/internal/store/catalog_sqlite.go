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

// CatalogItems lists catalog items, optionally filtered by kind, a name/code
// search term, and active state. Results are ordered by name for the pickers.
func (s *SQLiteStore) CatalogItems(
	ctx context.Context,
	query CatalogItemQuery,
) (CatalogItemListResult, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return CatalogItemListResult{}, err
	}
	conditions := []string{"tenant_id = ?"}
	args := []any{tenantID}
	if query.Kind != "" {
		conditions = append(conditions, "kind = ?")
		args = append(args, string(query.Kind))
	}
	if search := strings.TrimSpace(query.Search); search != "" {
		// Fold Serbian diacritics on both sides so "stampa" matches "Štampa".
		// COLLATE NOCASE then folds the remaining ASCII case.
		conditions = append(conditions, "("+foldDiacriticsSQL("name")+" LIKE ? COLLATE NOCASE OR "+foldDiacriticsSQL("code")+" LIKE ? COLLATE NOCASE)")
		like := "%" + foldDiacritics(search) + "%"
		args = append(args, like, like)
	}
	if query.ActiveOnly {
		conditions = append(conditions, "is_active = 1")
	}

	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM catalog_items`+where, args...).Scan(&total); err != nil {
		return CatalogItemListResult{}, fmt.Errorf("count catalog items: %w", err)
	}

	sqlText := `SELECT id, code, name, kind, unit, purchase_price, sale_price, barcode, tax_group, description, is_active, created_at, updated_at
		FROM catalog_items` + where + ` ORDER BY name COLLATE NOCASE`
	if query.Limit > 0 {
		sqlText += " LIMIT ? OFFSET ?"
		args = append(args, query.Limit, maxInt(query.Offset, 0))
	}

	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return CatalogItemListResult{}, fmt.Errorf("list catalog items: %w", err)
	}
	defer rows.Close()

	items := make([]domain.CatalogItem, 0)
	for rows.Next() {
		item, err := scanCatalogItem(rows)
		if err != nil {
			return CatalogItemListResult{}, err
		}
		items = append(items, item)
	}
	return CatalogItemListResult{Items: items, Total: total}, rows.Err()
}

// CatalogItemByID returns a single catalog item, or nil when no row matches.
func (s *SQLiteStore) CatalogItemByID(ctx context.Context, id string) (*domain.CatalogItem, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, code, name, kind, unit, purchase_price, sale_price, barcode, tax_group, description, is_active, created_at, updated_at
			FROM catalog_items WHERE id = ? AND tenant_id = ?`,
		id,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("get catalog item: %w", err)
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	item, err := scanCatalogItem(rows)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// UpsertCatalogItem creates or replaces a catalog item. A blank ID generates a
// new one; callers (admin create, seed) may also pass a stable ID.
func (s *SQLiteStore) UpsertCatalogItem(
	ctx context.Context,
	item domain.CatalogItem,
) (*domain.CatalogItem, error) {
	normalized, err := normalizeCatalogItem(item)
	if err != nil {
		return nil, err
	}
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	today := time.Now().UTC().Format("2006-01-02")

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin upsert catalog item: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := ensureRowTenant(ctx, tx, "catalog_items", normalized.ID, tenantID); err != nil {
		return nil, err
	}

	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO catalog_items(id, tenant_id, code, name, kind, unit, purchase_price, sale_price, barcode, tax_group, description, is_active, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   code = excluded.code,
		   name = excluded.name,
		   kind = excluded.kind,
		   unit = excluded.unit,
		   purchase_price = excluded.purchase_price,
		   sale_price = excluded.sale_price,
		   barcode = excluded.barcode,
		   tax_group = excluded.tax_group,
		   description = excluded.description,
		   is_active = excluded.is_active,
		   updated_at = excluded.updated_at`,
		normalized.ID,
		tenantID,
		normalized.Code,
		normalized.Name,
		string(normalized.Kind),
		normalized.Unit,
		ptrFloatValue(normalized.PurchasePrice),
		ptrFloatValue(normalized.SalePrice),
		ptrStringValue(normalized.Barcode),
		ptrStringValue(normalized.TaxGroup),
		ptrStringValue(normalized.Description),
		boolInt(normalized.IsActive),
		now,
		now,
	)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError("Artikal sa istom šifrom već postoji.")
		}
		return nil, fmt.Errorf("upsert catalog item: %w", err)
	}

	// Append an effective-dated cost record when the price changed (or seed the
	// first record for a new item), so work orders can snapshot historical cost.
	if err := recordCatalogCost(ctx, tx, normalized.ID, normalized.PurchasePrice, normalized.SalePrice, today); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit upsert catalog item: %w", err)
	}

	normalized.UpdatedAt = now
	if normalized.CreatedAt == "" {
		normalized.CreatedAt = now
	}
	return &normalized, nil
}

// serbianDiacritics maps Serbian Latin diacritics to their ASCII equivalents.
// SQLite's COLLATE NOCASE only folds ASCII case, so we fold these ourselves to
// make catalog search diacritic-insensitive ("stampa" matches "Štampa").
var serbianDiacritics = []struct{ from, to string }{
	{"č", "c"}, {"Č", "c"},
	{"ć", "c"}, {"Ć", "c"},
	{"š", "s"}, {"Š", "s"},
	{"ž", "z"}, {"Ž", "z"},
	{"đ", "dj"}, {"Đ", "dj"},
}

// foldDiacritics folds Serbian diacritics in a Go string (for the search term).
func foldDiacritics(s string) string {
	for _, d := range serbianDiacritics {
		s = strings.ReplaceAll(s, d.from, d.to)
	}
	return s
}

// foldDiacriticsSQL builds a nested REPLACE() expression that folds Serbian
// diacritics on a column inside a query, mirroring foldDiacritics.
func foldDiacriticsSQL(column string) string {
	expr := column
	for _, d := range serbianDiacritics {
		expr = fmt.Sprintf("REPLACE(%s,'%s','%s')", expr, d.from, d.to)
	}
	return expr
}

// DeleteCatalogItem removes a catalog item by id.
func (s *SQLiteStore) DeleteCatalogItem(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM catalog_items WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return fmt.Errorf("delete catalog item: %w", err)
	}
	return nil
}

func scanCatalogItem(rows *sql.Rows) (domain.CatalogItem, error) {
	var item domain.CatalogItem
	var kind string
	var purchasePrice, salePrice sql.NullFloat64
	var barcode, taxGroup, description sql.NullString
	var isActive int
	if err := rows.Scan(
		&item.ID,
		&item.Code,
		&item.Name,
		&kind,
		&item.Unit,
		&purchasePrice,
		&salePrice,
		&barcode,
		&taxGroup,
		&description,
		&isActive,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return domain.CatalogItem{}, fmt.Errorf("scan catalog item: %w", err)
	}
	item.Kind = domain.CatalogItemKind(kind)
	if purchasePrice.Valid {
		item.PurchasePrice = &purchasePrice.Float64
	}
	if salePrice.Valid {
		item.SalePrice = &salePrice.Float64
	}
	item.Barcode = nullStringPtr(barcode)
	item.TaxGroup = nullStringPtr(taxGroup)
	item.Description = nullStringPtr(description)
	item.IsActive = isActive != 0
	return item, nil
}

// normalizeCatalogItem trims fields, applies defaults, validates required fields
// and assigns an ID when missing.
func normalizeCatalogItem(item domain.CatalogItem) (domain.CatalogItem, error) {
	item.Code = strings.TrimSpace(item.Code)
	item.Name = strings.TrimSpace(item.Name)
	item.Unit = strings.ToLower(strings.TrimSpace(item.Unit))
	if item.Unit == "" {
		item.Unit = "kom"
	}
	if item.Kind == "" {
		item.Kind = domain.CatalogItemKindService
	}
	if item.Name == "" {
		return domain.CatalogItem{}, newValidationError("Naziv artikla je obavezan.")
	}
	if item.Kind != domain.CatalogItemKindService && item.Kind != domain.CatalogItemKindArticle {
		return domain.CatalogItem{}, newValidationError(invalidWorkOrderMessage)
	}
	if strings.TrimSpace(item.ID) == "" {
		id, err := newCatalogID()
		if err != nil {
			return domain.CatalogItem{}, err
		}
		item.ID = id
	}
	if item.Code == "" {
		// Code is required (unique); fall back to the generated ID so admin-created
		// items without a legacy SIFRA still satisfy the constraint.
		item.Code = item.ID
	}
	return item, nil
}

func newCatalogID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create catalog id: %w", err)
	}
	return "cat-" + hex.EncodeToString(raw[:]), nil
}
