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

const workOrderIDCounterSQL = `
CREATE TABLE IF NOT EXISTS work_order_id_counter (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	value INTEGER NOT NULL
);
INSERT OR IGNORE INTO work_order_id_counter(id, value)
SELECT 1, COALESCE(MAX(CAST(id AS INTEGER)), 0) FROM work_orders
`

func nextSequence(ctx context.Context, db sqlExecutor) (int, error) {
	var next int64
	err := db.QueryRowContext(
		ctx,
		`UPDATE work_order_id_counter SET value = value + 1 WHERE id = 1 RETURNING value`,
	).Scan(&next)
	if err == sql.ErrNoRows {
		// Counter row missing (should not happen after migration v23): seed it.
		if _, err := db.ExecContext(ctx, `INSERT INTO work_order_id_counter(id, value)
			SELECT 1, COALESCE(MAX(CAST(id AS INTEGER)), 0) FROM work_orders`); err != nil {
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
