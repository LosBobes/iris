package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sort"
	"strings"
)

// migrationExcludedTables are SQLite tables that migrate-to-postgres
// deliberately does not copy, with the reason. Every table in sqlite_master that
// is neither in migrationTables nor here is reported as uncovered, and a test
// fails on it, so a table added by a later migration cannot be silently dropped.
var migrationExcludedTables = map[string]string{
	"schema_migrations":         "Postgres stamps its own baseline; copying SQLite's rows would claim SQLite-only migrations ran",
	"platform_login_challenges": "five-minute sign-in challenges between the password and two-factor steps; a pending sign-in simply starts over",
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
	// ForeignKeyViolations lists child rows whose parent row is missing
	// (PRAGMA foreign_key_check). SQLite only enforces foreign keys on a
	// connection that enabled them, so such rows can exist; Postgres always
	// enforces them and would abort the copy with SQLSTATE 23503.
	ForeignKeyViolations []ForeignKeyViolation
}

// ForeignKeyViolation groups the rows of one table that break one of its
// foreign keys.
type ForeignKeyViolation struct {
	Table string
	// Columns are the child table's key columns (comma-separated).
	Columns string
	Parent  string
	// ParentColumns are the referenced columns; for a foreign key that names
	// no columns this is the parent's primary key.
	ParentColumns string
	// OnDelete is the key's ON DELETE action ("CASCADE", "SET NULL", ...).
	OnDelete string
	Rows     int
}

// String is the -check report line (Serbian, like the rest of irisctl).
func (v ForeignKeyViolation) String() string {
	return fmt.Sprintf("strani ključ: %d redova u %s (%s) upućuje na nepostojeće redove u %s (%s)",
		v.Rows, v.Table, v.Columns, v.Parent, v.ParentColumns)
}

// noAutomaticCleanup are tables whose orphans must never be scripted away,
// even under ON DELETE CASCADE: the stock ledger is append-only (D-018), and
// the app refuses to delete an article that has movements, so an orphaned
// movement means a lost article to restore (from a backup), not rows to drop.
var noAutomaticCleanup = map[string]bool{"stock_movements": true}

// CleanupSQL is the statement that does what the key's ON DELETE action
// would have done had foreign keys been enforced when the parents were
// deleted, or "" when there is no safe automatic fix (RESTRICT / NO ACTION,
// a composite key, or a table in noAutomaticCleanup): those rows need a
// decision, not a script.
func (v ForeignKeyViolation) CleanupSQL() string {
	if v.Columns == "" || v.ParentColumns == "" || strings.Contains(v.Columns, ",") || noAutomaticCleanup[v.Table] {
		return ""
	}
	orphaned := fmt.Sprintf("%s NOT IN (SELECT %s FROM %s)", v.Columns, v.ParentColumns, v.Parent)
	switch strings.ToUpper(v.OnDelete) {
	case "CASCADE":
		return fmt.Sprintf("DELETE FROM %s WHERE %s;", v.Table, orphaned)
	case "SET NULL":
		return fmt.Sprintf("UPDATE %s SET %s = NULL WHERE %s;", v.Table, v.Columns, orphaned)
	}
	return ""
}

// Hint is the Serbian fix line shown under the violation: the cleanup
// statement when there is a safe one, otherwise what to do by hand.
func (v ForeignKeyViolation) Hint() string {
	if cleanup := v.CleanupSQL(); cleanup != "" {
		return "ispravka (isto što bi uradio ON DELETE " + strings.ToUpper(v.OnDelete) + "): " + cleanup
	}
	if v.Table == "stock_movements" {
		return "ispravka: magacinski promet se ne briše; vratite obrisane artikle (" + v.Parent + ") iz rezervne kopije"
	}
	return "ispravka: proverite ove redove ručno (nema bezbedne automatske ispravke)"
}

// ForeignKeyViolationsError refuses a migration whose source has rows that
// Postgres would reject. It lists every violation with its cleanup hint.
type ForeignKeyViolationsError struct {
	Violations []ForeignKeyViolation
}

func (e *ForeignKeyViolationsError) Error() string {
	var b strings.Builder
	b.WriteString("izvorna baza ima redove koji krše strane ključeve; Postgres bi prekinuo kopiranje (SQLSTATE 23503), pa migracija nije pokrenuta:")
	for _, violation := range e.Violations {
		b.WriteString("\n  - ")
		b.WriteString(violation.String())
		b.WriteString("\n    ")
		b.WriteString(violation.Hint())
	}
	b.WriteString("\nNapravite rezervnu kopiju (irisctl backup), primenite ispravke na SQLite bazu i ponovite: irisctl migrate-to-postgres -check")
	return b.String()
}

// ForeignKeyViolations runs PRAGMA foreign_key_check on a SQLite store and
// groups the result per table and key, with the key's columns and ON DELETE
// action for the report. It only reads.
func ForeignKeyViolations(ctx context.Context, source *SQLStore) ([]ForeignKeyViolation, error) {
	if source.dialect != dialectSQLite {
		return nil, fmt.Errorf("foreign key check needs a sqlite store, got %s", source.dialect)
	}
	type key struct {
		table string
		id    int
	}
	rows, err := source.db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return nil, fmt.Errorf("foreign key check: %w", err)
	}
	counts := map[key]int{}
	parents := map[key]string{}
	var order []key
	for rows.Next() {
		// table, rowid (NULL for WITHOUT ROWID tables), parent, fkid
		var table, parent string
		var rowID sql.NullInt64
		var id int
		if err := rows.Scan(&table, &rowID, &parent, &id); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan foreign key check: %w", err)
		}
		k := key{table, id}
		if _, seen := counts[k]; !seen {
			order = append(order, k)
			parents[k] = parent
		}
		counts[k]++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("foreign key check: %w", err)
	}

	violations := make([]ForeignKeyViolation, 0, len(order))
	for _, k := range order {
		violation := ForeignKeyViolation{Table: k.table, Parent: parents[k], Rows: counts[k]}
		if err := describeForeignKey(ctx, source.db, &violation, k.id); err != nil {
			return nil, err
		}
		violations = append(violations, violation)
	}
	sort.SliceStable(violations, func(i, j int) bool {
		if violations[i].Table != violations[j].Table {
			return violations[i].Table < violations[j].Table
		}
		return violations[i].Parent < violations[j].Parent
	})
	return violations, nil
}

// describeForeignKey fills in the columns and ON DELETE action of foreign key
// fkID of the violation's table (PRAGMA foreign_key_list).
func describeForeignKey(ctx context.Context, db *sql.DB, violation *ForeignKeyViolation, fkID int) error {
	rows, err := db.QueryContext(ctx,
		`SELECT "from", "to", on_delete FROM pragma_foreign_key_list(?) WHERE id = ? ORDER BY seq`,
		violation.Table, fkID)
	if err != nil {
		return fmt.Errorf("describe foreign key of %s: %w", violation.Table, err)
	}
	defer rows.Close()
	var from, to []string
	for rows.Next() {
		var child string
		var parent sql.NullString
		if err := rows.Scan(&child, &parent, &violation.OnDelete); err != nil {
			return fmt.Errorf("scan foreign key of %s: %w", violation.Table, err)
		}
		from = append(from, child)
		if parent.Valid && parent.String != "" {
			to = append(to, parent.String)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("describe foreign key of %s: %w", violation.Table, err)
	}
	if len(to) == 0 {
		// REFERENCES parent with no column list: the parent's primary key.
		pk, err := primaryKeyColumns(ctx, db, violation.Parent)
		if err != nil {
			return err
		}
		to = pk
	}
	violation.Columns = strings.Join(from, ", ")
	violation.ParentColumns = strings.Join(to, ", ")
	return nil
}

func primaryKeyColumns(ctx context.Context, db *sql.DB, table string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk`, table)
	if err != nil {
		return nil, fmt.Errorf("read primary key of %s: %w", table, err)
	}
	defer rows.Close()
	var columns []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan primary key of %s: %w", table, err)
		}
		columns = append(columns, name)
	}
	return columns, rows.Err()
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
// row counts, uncovered tables, data that Postgres would alter or reject, and
// rows that break a foreign key.
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

	violations, err := ForeignKeyViolations(ctx, source)
	if err != nil {
		return nil, err
	}
	report.ForeignKeyViolations = violations
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
