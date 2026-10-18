package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
)

// migrationExcludedTables are SQLite tables that migrate-to-postgres
// deliberately does not copy, with the reason. Every table in sqlite_master that
// is neither in migrationTables nor here is reported as uncovered, and a test
// fails on it, so a table added by a later migration cannot be silently dropped.
var migrationExcludedTables = map[string]string{
	"schema_migrations": "Postgres stamps its own baseline; copying SQLite's rows would claim SQLite-only migrations ran",
}

// numericColumns are the columns that become NUMERIC(14, 4) in Postgres. Values
// with more than four decimals would be rounded and values >= 1e10 would
// overflow, so the check reports them before any copy is attempted.
var numericColumns = []struct{ Table, Column string }{
	{"work_orders", "price"},
	{"work_order_materials", "unit_cost"},
	{"invoice_line_items", "unit_price"},
	{"catalog_items", "default_price"},
	{"catalog_items", "purchase_price"},
	{"catalog_items", "sale_price"},
	{"catalog_items", "min_stock"},
	{"catalog_item_price_history", "purchase_price"},
	{"catalog_item_price_history", "sale_price"},
	{"stock_movements", "quantity"},
}

// SourceReport describes a SQLite database as a migration source.
type SourceReport struct {
	SchemaVersion int
	Counts        []TableCount
	// Uncovered lists tables present in the source that the migration neither
	// copies nor excludes on purpose.
	Uncovered []string
	// Problems lists data that would not survive the copy unchanged.
	Problems []string
}

// ValidateSQLiteSourceFile rejects a path that is not an existing, non-empty
// regular file. It must run before OpenSQLite, which creates missing
// directories and files and would otherwise turn a typo into an empty database.
func ValidateSQLiteSourceFile(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("izvorna SQLite baza ne postoji: %s (proverite -from)", path)
		}
		return fmt.Errorf("izvorna SQLite baza nije dostupna: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("izvor nije običan fajl: %s", path)
	}
	if info.Size() == 0 {
		return fmt.Errorf("izvorna SQLite baza je prazna: %s", path)
	}
	return nil
}

// UncoveredTables returns the source tables the migration does not know about.
func UncoveredTables(ctx context.Context, source *SQLStore) ([]string, error) {
	rows, err := source.db.QueryContext(ctx,
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list source tables: %w", err)
	}
	defer rows.Close()

	covered := make(map[string]bool, len(migrationTables))
	for _, table := range migrationTables {
		covered[table] = true
	}
	var uncovered []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan source table: %w", err)
		}
		if _, excluded := migrationExcludedTables[name]; !covered[name] && !excluded {
			uncovered = append(uncovered, name)
		}
	}
	return uncovered, rows.Err()
}

// InspectMigrationSource validates a SQLite database as a migration source
// without any Postgres target: it refuses a database with no tenants or users
// (a typo'd path that OpenSQLite turned into a fresh seed database) and reports
// row counts, uncovered tables, and data that Postgres would alter or reject.
func InspectMigrationSource(ctx context.Context, source *SQLStore) (*SourceReport, error) {
	if source.dialect != dialectSQLite {
		return nil, fmt.Errorf("migration source must be a sqlite store, got %s", source.dialect)
	}
	report := &SourceReport{}

	for _, table := range migrationTables {
		var count int
		if err := source.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table).Scan(&count); err != nil {
			return nil, fmt.Errorf("count source %s: %w", table, err)
		}
		report.Counts = append(report.Counts, TableCount{Table: table, Rows: count})
	}
	for _, count := range report.Counts {
		if (count.Table == "tenants" || count.Table == "users") && count.Rows == 0 {
			return nil, fmt.Errorf("izvorna baza nema nijedan red u tabeli %s: proverite putanju -from", count.Table)
		}
	}

	if err := source.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&report.SchemaVersion); err != nil {
		return nil, fmt.Errorf("read schema version: %w", err)
	}

	uncovered, err := UncoveredTables(ctx, source)
	if err != nil {
		return nil, err
	}
	report.Uncovered = uncovered

	problems, err := sourceProblems(ctx, source.db)
	if err != nil {
		return nil, err
	}
	report.Problems = problems
	return report, nil
}

func sourceProblems(ctx context.Context, db *sql.DB) ([]string, error) {
	var problems []string

	// Order numbers whose suffix after "RN-YYYY-" is not 1-9 digits. The next
	// number is derived by casting that suffix to an integer.
	rows, err := db.QueryContext(ctx, `SELECT order_number FROM work_orders
		WHERE order_number GLOB 'RN-[0-9][0-9][0-9][0-9]-*'
		  AND (substr(order_number, 9) = ''
		    OR substr(order_number, 9) GLOB '*[^0-9]*'
		    OR length(substr(order_number, 9)) > 9)
		ORDER BY order_number LIMIT 20`)
	if err != nil {
		return nil, fmt.Errorf("check order numbers: %w", err)
	}
	for rows.Next() {
		var number string
		if err := rows.Scan(&number); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan order number: %w", err)
		}
		problems = append(problems, "broj naloga sa nebrojčanim sufiksom: "+number)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, column := range numericColumns {
		var bad int
		// A value has more than four decimals when scaling by 1e4 leaves a
		// fraction; the tolerance absorbs binary REAL noise (0.1 + 0.2).
		query := fmt.Sprintf(`SELECT COUNT(*) FROM %[1]s WHERE %[2]s IS NOT NULL AND (
			abs(%[2]s) >= 1e10 OR abs(%[2]s * 10000 - round(%[2]s * 10000)) > 1e-6)`,
			column.Table, column.Column)
		if err := db.QueryRowContext(ctx, query).Scan(&bad); err != nil {
			return nil, fmt.Errorf("check %s.%s: %w", column.Table, column.Column, err)
		}
		if bad > 0 {
			problems = append(problems, fmt.Sprintf(
				"%s.%s: %d vrednosti sa više od 4 decimale ili >= 1e10", column.Table, column.Column, bad))
		}
	}

	return problems, nil
}
