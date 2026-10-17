package store

// stockMigration adds the warehouse ledger. Stock is the sum of an article's
// movements; rows are never edited or deleted. Deleting an article cascades to
// its movements (the API refuses that while movements exist), and deleting a
// work order only detaches its movements (work_order_id becomes NULL) because
// the material was physically used. min_stock is the optional reorder threshold.
const stockMigration = `
CREATE TABLE IF NOT EXISTS stock_movements (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('opening', 'receipt', 'consumption', 'production', 'adjustment')),
	quantity REAL NOT NULL,
	work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL,
	process_node_id TEXT,
	document_ref TEXT,
	note TEXT,
	created_at TEXT NOT NULL,
	created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(work_order_id);

ALTER TABLE catalog_items ADD COLUMN min_stock REAL;
`
