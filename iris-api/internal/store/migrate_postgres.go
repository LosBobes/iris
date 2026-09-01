package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// migrationTables lists every table the data migration copies, in an order that
// satisfies the foreign keys (parents before children).
//
// schema_migrations is deliberately absent: the Postgres database stamps its own
// baseline in runPostgresMigrations, and copying SQLite's rows would claim that
// SQLite-only migrations had been applied. sqlite_sequence is an internal SQLite
// table with no Postgres counterpart.
var migrationTables = []string{
	"tenants",
	"users",
	"sessions",
	"customers",
	"locations",
	"customer_emails",
	"customer_contacts",
	"work_orders",
	"work_order_status_history",
	"work_order_materials",
	"work_order_notes",
	"work_order_events",
	"work_order_attachments",
	"work_order_time_entries",
	"invoice_line_items",
	"work_order_number_reservations",
	"work_order_edit_locks",
	"enum_values",
	"catalog_items",
	"catalog_item_price_history",
	"app_settings",
}

// identitySequenceTables lists tables whose primary key is a Postgres identity
// column. Rows are copied with their original ids, which does not advance the
// underlying sequence, so it has to be re-synced afterwards or the next insert
// collides with a copied row.
var identitySequenceTables = []string{"work_order_status_history"}

// TableCount is the number of rows a single table contributed to a migration.
type TableCount struct {
	Table string
	Rows  int
}

// MigrateToPostgres copies every row from a SQLite-backed store into a
// Postgres-backed store, preserving ids, password hashes and timestamps exactly.
//
// The copy is row-level rather than domain-level on purpose: routing the data
// through the Store interface would re-hash passwords, re-generate ids and
// re-stamp timestamps, producing a database that merely resembles the original.
//
// The whole copy runs in one transaction, so a failure leaves the target
// untouched rather than half-populated.
func MigrateToPostgres(ctx context.Context, source *SQLStore, target *SQLStore) ([]TableCount, error) {
	if source.dialect != dialectSQLite {
		return nil, fmt.Errorf("migration source must be a sqlite store, got %s", source.dialect)
	}
	if target.dialect != dialectPostgres {
		return nil, fmt.Errorf("migration target must be a postgres store, got %s", target.dialect)
	}

	if err := verifyTargetIsEmpty(ctx, target); err != nil {
		return nil, err
	}

	tx, err := target.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin migration: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// The schema seeds a production tenant and its default firm name. The source
	// carries its own copies of those rows (possibly with an edited firm name),
	// so the seeds are cleared first and the source's values win.
	for _, table := range []string{"app_settings", "tenants"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table); err != nil {
			return nil, fmt.Errorf("clear seeded %s: %w", table, err)
		}
	}

	var counts []TableCount
	for _, table := range migrationTables {
		rows, err := copyTable(ctx, source.db, tx, table)
		if err != nil {
			return nil, err
		}
		counts = append(counts, TableCount{Table: table, Rows: rows})
	}

	for _, table := range identitySequenceTables {
		if err := resyncIdentitySequence(ctx, tx, table); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit migration: %w", err)
	}

	return counts, nil
}

// seedOwnedTables are populated by postgresSchema/postgresSeed (and by
// EnsureTenant when an organization is provisioned), so rows in them are not
// evidence that the target holds real data. The migration clears and replaces
// them from the source, which is why they are exempt from the emptiness check
// rather than merely allowed a row or two.
var seedOwnedTables = map[string]bool{"tenants": true, "app_settings": true}

// verifyTargetIsEmpty refuses to copy into a database that already holds data.
// Without this a re-run would silently double every table, or fail halfway
// through on a unique index. Any real database has users, so checking the data
// tables is a reliable signal.
func verifyTargetIsEmpty(ctx context.Context, target *SQLStore) error {
	for _, table := range migrationTables {
		if seedOwnedTables[table] {
			continue
		}
		var count int
		if err := target.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table).Scan(&count); err != nil {
			return fmt.Errorf("count rows in target %s: %w", table, err)
		}
		if count > 0 {
			return fmt.Errorf(
				"target table %s already holds %d rows: migrate into an empty database, or reset it first",
				table, count,
			)
		}
	}
	return nil
}

// copyTable streams one table from SQLite into Postgres. Columns are read from
// the source result set rather than hard-coded, so the copy follows the schema
// instead of a list that has to be kept in sync with it.
func copyTable(ctx context.Context, source *sql.DB, target *sql.Tx, table string) (int, error) {
	rows, err := source.QueryContext(ctx, `SELECT * FROM `+table)
	if err != nil {
		return 0, fmt.Errorf("read source %s: %w", table, err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return 0, fmt.Errorf("read columns of %s: %w", table, err)
	}

	insert := fmt.Sprintf(
		`INSERT INTO %s (%s) VALUES (%s)`,
		table,
		strings.Join(columns, ", "),
		strings.TrimSuffix(strings.Repeat("?, ", len(columns)), ", "),
	)
	statement, err := target.PrepareContext(ctx, insert)
	if err != nil {
		return 0, fmt.Errorf("prepare insert into %s: %w", table, err)
	}
	defer statement.Close()

	copied := 0
	for rows.Next() {
		values := make([]any, len(columns))
		targets := make([]any, len(columns))
		for i := range values {
			targets[i] = &values[i]
		}
		if err := rows.Scan(targets...); err != nil {
			return 0, fmt.Errorf("scan row from %s: %w", table, err)
		}

		for i, value := range values {
			values[i] = normalizeCopiedValue(value)
		}
		if _, err := statement.ExecContext(ctx, values...); err != nil {
			return 0, fmt.Errorf("insert row %d into %s: %w", copied+1, table, err)
		}
		copied++
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate source %s: %w", table, err)
	}

	return copied, nil
}

// normalizeCopiedValue converts SQLite's driver representation into something
// the Postgres driver accepts. SQLite hands back TEXT as []byte in some builds,
// which Postgres would try to write into a text column as bytea.
func normalizeCopiedValue(value any) any {
	if raw, ok := value.([]byte); ok {
		return string(raw)
	}
	return value
}

// resyncIdentitySequence advances an identity column's sequence past the ids
// that were copied in, so the next generated id does not collide.
func resyncIdentitySequence(ctx context.Context, tx *sql.Tx, table string) error {
	query := fmt.Sprintf(
		`SELECT setval(
			pg_get_serial_sequence('%s', 'id'),
			COALESCE((SELECT MAX(id) FROM %s), 1),
			(SELECT COUNT(*) > 0 FROM %s)
		)`,
		table, table, table,
	)
	if _, err := tx.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("resync identity sequence for %s: %w", table, err)
	}
	return nil
}

// VerifyMigration re-counts every table on both sides and reports the ones that
// disagree. It runs after the copy has committed, as an independent check that
// does not share the copy's own bookkeeping.
func VerifyMigration(ctx context.Context, source *SQLStore, target *SQLStore) ([]string, error) {
	var mismatches []string

	for _, table := range migrationTables {
		var sourceCount, targetCount int
		if err := source.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table).Scan(&sourceCount); err != nil {
			return nil, fmt.Errorf("count source %s: %w", table, err)
		}
		if err := target.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table).Scan(&targetCount); err != nil {
			return nil, fmt.Errorf("count target %s: %w", table, err)
		}
		if sourceCount != targetCount {
			mismatches = append(mismatches, fmt.Sprintf(
				"%s: sqlite has %d rows, postgres has %d", table, sourceCount, targetCount,
			))
		}
	}

	return mismatches, nil
}
