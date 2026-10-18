-- Pre-flight checks for the SQLite -> PostgreSQL cutover (deploy/POSTGRES.md).
--
-- Run it against an `irisctl backup` copy, never against the live iris.db:
--   docker run --rm -v "$PWD:/w" -w /w alpine:3.21 \
--     sh -c "apk add -q sqlite && sqlite3 -readonly <file> < preflight.sql"
-- (copy this file next to the backup as preflight.sql first).
--
-- `irisctl migrate-to-postgres -check` runs the same checks and is the
-- authoritative one; this file is a second opinion that does not depend on the
-- Go code. Every "expect: 0 rows" section must come back empty.

.headers on
.mode column

.print
.print == schema version (expect the newest migration number; 25 at time of writing)
SELECT MAX(version) AS schema_version FROM schema_migrations;

.print
.print == order numbers whose suffix is not 1-9 digits (expect: 0 rows)
-- The next number is derived by casting the part after "RN-YYYY-" to an integer.
SELECT id, tenant_id, order_number FROM work_orders
WHERE order_number GLOB 'RN-[0-9][0-9][0-9][0-9]-*'
  AND (substr(order_number, 9) = ''
    OR substr(order_number, 9) GLOB '*[^0-9]*'
    OR length(substr(order_number, 9)) > 9);

.print
.print == money / quantity values PostgreSQL NUMERIC(14,4) would round or reject (expect: bad = 0 on every line)
-- More than 4 decimals, or >= 1e10. The 1e-6 tolerance absorbs binary REAL noise.
SELECT 'work_orders.price' AS col, COUNT(*) AS bad FROM work_orders
  WHERE price IS NOT NULL AND (abs(price) >= 1e10 OR abs(price * 10000 - round(price * 10000)) > 1e-6)
UNION ALL SELECT 'work_order_materials.unit_cost', COUNT(*) FROM work_order_materials
  WHERE unit_cost IS NOT NULL AND (abs(unit_cost) >= 1e10 OR abs(unit_cost * 10000 - round(unit_cost * 10000)) > 1e-6)
UNION ALL SELECT 'invoice_line_items.unit_price', COUNT(*) FROM invoice_line_items
  WHERE unit_price IS NOT NULL AND (abs(unit_price) >= 1e10 OR abs(unit_price * 10000 - round(unit_price * 10000)) > 1e-6)
UNION ALL SELECT 'catalog_items.default_price', COUNT(*) FROM catalog_items
  WHERE default_price IS NOT NULL AND (abs(default_price) >= 1e10 OR abs(default_price * 10000 - round(default_price * 10000)) > 1e-6)
UNION ALL SELECT 'catalog_items.purchase_price', COUNT(*) FROM catalog_items
  WHERE purchase_price IS NOT NULL AND (abs(purchase_price) >= 1e10 OR abs(purchase_price * 10000 - round(purchase_price * 10000)) > 1e-6)
UNION ALL SELECT 'catalog_items.sale_price', COUNT(*) FROM catalog_items
  WHERE sale_price IS NOT NULL AND (abs(sale_price) >= 1e10 OR abs(sale_price * 10000 - round(sale_price * 10000)) > 1e-6)
UNION ALL SELECT 'catalog_items.min_stock', COUNT(*) FROM catalog_items
  WHERE min_stock IS NOT NULL AND (abs(min_stock) >= 1e10 OR abs(min_stock * 10000 - round(min_stock * 10000)) > 1e-6)
UNION ALL SELECT 'catalog_item_price_history.purchase_price', COUNT(*) FROM catalog_item_price_history
  WHERE purchase_price IS NOT NULL AND (abs(purchase_price) >= 1e10 OR abs(purchase_price * 10000 - round(purchase_price * 10000)) > 1e-6)
UNION ALL SELECT 'catalog_item_price_history.sale_price', COUNT(*) FROM catalog_item_price_history
  WHERE sale_price IS NOT NULL AND (abs(sale_price) >= 1e10 OR abs(sale_price * 10000 - round(sale_price * 10000)) > 1e-6)
UNION ALL SELECT 'stock_movements.quantity', COUNT(*) FROM stock_movements
  WHERE quantity IS NOT NULL AND (abs(quantity) >= 1e10 OR abs(quantity * 10000 - round(quantity * 10000)) > 1e-6);

.print
.print == rows whose foreign key points at a missing parent (expect: 0 rows)
-- SQLite enforces foreign keys only on connections that switched them on, so a
-- parent deleted on one that had not (an old build, a manual sqlite3 session)
-- leaves its children behind; PostgreSQL rejects them and the copy aborts with
-- SQLSTATE 23503. `-check` prints the fix for each line. For orphaned price
-- history (the October 2026 cutover) it is what ON DELETE CASCADE would have done:
--   DELETE FROM catalog_item_price_history WHERE catalog_item_id NOT IN (SELECT id FROM catalog_items);
-- Never delete orphaned stock_movements (append-only ledger): restore the
-- missing catalog_items from a backup instead.
SELECT fk."table" AS child_table, fk.parent AS parent_table, COUNT(*) AS orphaned_rows
FROM pragma_foreign_key_check AS fk
GROUP BY fk."table", fk.parent
ORDER BY fk."table", fk.parent;

.print
.print == tables migrate-to-postgres does NOT copy (expect: 0 rows; schema_migrations is excluded on purpose)
-- Keep in sync with migrationTables / migrationExcludedTables in
-- iris-api/internal/store/; `-check` computes this from the code and is the
-- authoritative version.
SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN (
  'schema_migrations', 'tenants', 'platform_admins', 'platform_sessions', 'impersonation_events',
  'users', 'sessions', 'customers', 'locations', 'customer_emails', 'customer_contacts',
  'work_orders', 'work_order_id_counter', 'work_order_status_history', 'work_order_materials', 'work_order_notes',
  'work_order_events', 'work_order_attachments', 'work_order_time_entries', 'invoice_line_items',
  'work_order_number_reservations', 'work_order_edit_locks', 'enum_values', 'catalog_items',
  'catalog_item_price_history', 'app_settings', 'login_events', 'impersonation_actions',
  'platform_audit_events', 'process_templates', 'work_order_processes', 'stock_movements')
ORDER BY name;

.print
.print == row counts (compare with the migrate-to-postgres output and the psql counts)
SELECT 'tenants' AS tbl, COUNT(*) AS rows FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'locations', COUNT(*) FROM locations
UNION ALL SELECT 'work_orders', COUNT(*) FROM work_orders
UNION ALL SELECT 'work_order_materials', COUNT(*) FROM work_order_materials
UNION ALL SELECT 'work_order_events', COUNT(*) FROM work_order_events
UNION ALL SELECT 'work_order_attachments', COUNT(*) FROM work_order_attachments
UNION ALL SELECT 'catalog_items', COUNT(*) FROM catalog_items
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'process_templates', COUNT(*) FROM process_templates
UNION ALL SELECT 'work_order_processes', COUNT(*) FROM work_order_processes;
