package store

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
)

// Work-order ids are a global numeric sequence ("1", "2", ...). Instead of
// scanning every tenant's ids for MAX(CAST(id AS INTEGER)) on each create, a
// single-row counter (table work_order_id_counter, migration v23) holds the
// highest numeric id handed out or stored. nextSequence increments it inside the
// create transaction; putWorkOrder raises it when a numeric id is written
// directly (fixtures, seeds, imports), so the counter never falls behind the
// data. Unlike MAX()+1, the counter never reuses the id of a deleted order.
//
// The counter can still lag when something else writes numeric ids (an older
// binary, manual SQL). CreateWorkOrder therefore checks that the id it drew is
// free and, if not, resyncs the counter to the real maximum (resyncSequence)
// and draws again; its insert has no ON CONFLICT clause, so a clash it did not
// see fails instead of overwriting another order.

// maxNumericIDSQL is the highest all-digit work-order id. Only all-digit ids
// are cast: CAST('demo-1' AS INTEGER) is an error on PostgreSQL, and SQLite
// would read '12abc' as 12.
const maxNumericIDSQL = `SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) FROM work_orders
	WHERE id <> '' AND id NOT GLOB '*[^0-9]*'`

const workOrderIDCounterSQL = `
CREATE TABLE IF NOT EXISTS work_order_id_counter (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	value INTEGER NOT NULL
);
INSERT OR IGNORE INTO work_order_id_counter(id, value)
SELECT 1, COALESCE(MAX(CAST(id AS INTEGER)), 0) FROM work_orders
	WHERE id <> '' AND id NOT GLOB '*[^0-9]*'
`

func nextSequence(ctx context.Context, db sqlExecutor) (int, error) {
	var next int64
	err := db.QueryRowContext(
		ctx,
		`UPDATE work_order_id_counter SET value = value + 1 WHERE id = 1 RETURNING value`,
	).Scan(&next)
	if err == sql.ErrNoRows {
		// Counter row missing (should not happen after migration v23): seed it.
		if _, err := db.ExecContext(ctx, `INSERT INTO work_order_id_counter(id, value) `+
			`SELECT 1, COALESCE(MAX(CAST(id AS INTEGER)), 0) FROM work_orders
			WHERE id <> '' AND id NOT GLOB '*[^0-9]*'`); err != nil {
			return 0, fmt.Errorf("seed work-order sequence: %w", err)
		}
		err = db.QueryRowContext(
			ctx,
			`UPDATE work_order_id_counter SET value = value + 1 WHERE id = 1 RETURNING value`,
		).Scan(&next)
	}
	if err != nil {
		return 0, fmt.Errorf("next work-order sequence: %w", err)
	}
	if next < 1 {
		return 1, nil
	}
	return int(next), nil
}

// resyncSequence raises the counter to the highest numeric id actually stored.
func resyncSequence(ctx context.Context, db sqlExecutor) error {
	var highest int64
	if err := db.QueryRowContext(ctx, maxNumericIDSQL).Scan(&highest); err != nil {
		return fmt.Errorf("read highest work-order id: %w", err)
	}
	if _, err := db.ExecContext(
		ctx,
		`UPDATE work_order_id_counter SET value = ? WHERE id = 1 AND value < ?`,
		highest, highest,
	); err != nil {
		return fmt.Errorf("resync work-order sequence: %w", err)
	}
	return nil
}

// maxSequenceAttempts bounds how often CreateWorkOrder redraws an id that is
// already taken (each redraw follows a resync, so one is normally enough).
const maxSequenceAttempts = 3

// nextFreeSequence draws the next id that no stored work order (of any
// tenant) uses yet. It must run in the create transaction, which already holds
// the write lock after the counter update, so the check cannot race.
func nextFreeSequence(ctx context.Context, db sqlExecutor) (int, error) {
	for attempt := 0; attempt < maxSequenceAttempts; attempt++ {
		sequence, err := nextSequence(ctx, db)
		if err != nil {
			return 0, err
		}
		var taken int
		err = db.QueryRowContext(ctx, `SELECT 1 FROM work_orders WHERE id = ?`, strconv.Itoa(sequence)).Scan(&taken)
		if err == sql.ErrNoRows {
			return sequence, nil
		}
		if err != nil {
			return 0, fmt.Errorf("check work-order id: %w", err)
		}
		if err := resyncSequence(ctx, db); err != nil {
			return 0, err
		}
	}
	return 0, fmt.Errorf("next work-order sequence: no free id after %d attempts", maxSequenceAttempts)
}

// bumpWorkOrderSequence raises the counter to at least id when id is a plain
// decimal number. Non-numeric ids (e.g. "wo-cob-1") never affect the sequence.
func bumpWorkOrderSequence(ctx context.Context, db sqlExecutor, id string) error {
	if id == "" || len(id) > 18 {
		return nil
	}
	for _, r := range id {
		if r < '0' || r > '9' {
			return nil
		}
	}
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil || n < 1 {
		return nil
	}
	if _, err := db.ExecContext(
		ctx,
		`UPDATE work_order_id_counter SET value = ? WHERE id = 1 AND value < ?`,
		n, n,
	); err != nil {
		return fmt.Errorf("bump work-order sequence: %w", err)
	}
	return nil
}
