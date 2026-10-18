package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Organization offboarding: a full export of one tenant's data and its guarded
// deletion. Both walk tenantDataTables, the single list of every table that
// holds tenant data; TestTenantDataTablesCoverSchema fails when a migration
// adds a table that is neither listed here nor in platformOnlyTables.

// tenantDataTable is one table holding an organization's rows.
type tenantDataTable struct {
	name string
	// where selects the tenant's rows; its single ? is the tenant id. Child
	// tables without a tenant_id reach it through their parent.
	where string
	// omit lists columns that are never exported (secrets).
	omit []string
	// jsonColumns hold JSON text and are embedded in the export as JSON.
	jsonColumns []string
	// noExport keeps the whole table out of the export (session tokens); its
	// rows are still deleted.
	noExport bool
	// keepOnDelete exports the rows but leaves them when the organization is
	// deleted: their tenant reference is ON DELETE SET NULL, so they outlive
	// it (impersonation history, v30).
	keepOnDelete bool
}

const (
	tenantRows       = `tenant_id = ?`
	tenantUsers      = `user_id IN (SELECT id FROM users WHERE tenant_id = ?)`
	tenantCustomers  = `customer_id IN (SELECT id FROM customers WHERE tenant_id = ?)`
	tenantWorkOrders = `work_order_id IN (SELECT id FROM work_orders WHERE tenant_id = ?)`
)

// tenantDataTables lists every tenant-owned table in delete order: children
// before the rows they reference, so the deletion never leans on ON DELETE
// CASCADE and can count each table's rows. The export walks it backwards
// (parents first).
var tenantDataTables = []tenantDataTable{
	// sessions reference users and impersonation_events (no cascade on the
	// latter), so they go first. Never exported: they are credentials.
	{name: "sessions", where: tenantUsers, noExport: true},
	// Impersonation history is exported but kept: deleting the tenant nulls
	// impersonation_events.tenant_id (slug and name stay on the row), and the
	// trail hangs off the event, so the activity log still shows both.
	{name: "impersonation_actions", where: `impersonation_id IN (SELECT id FROM impersonation_events WHERE tenant_id = ?)`, keepOnDelete: true},
	{name: "impersonation_events", where: tenantRows, keepOnDelete: true},
	{name: "login_events", where: tenantRows},
	// Superadmin-internal notes about the organization (D-022): removed with
	// it, but never handed to the organization in its export.
	{name: "tenant_notes", where: tenantRows, noExport: true},
	// Platform-side announcement targeting (D-024): not the organization's
	// data, so never exported, but its rows go with it (explicitly, like every
	// other table, rather than through ON DELETE CASCADE). An announcement
	// keeps all_tenants = 0, so losing its last target hides it rather than
	// widening it to everyone.
	{name: "platform_announcement_tenants", where: tenantRows, noExport: true},
	{name: "stock_movements", where: tenantRows},
	{name: "work_order_processes", where: tenantRows, jsonColumns: []string{"graph"}},
	{name: "process_templates", where: tenantRows, jsonColumns: []string{"graph"}},
	{name: "work_order_edit_locks", where: tenantRows},
	{name: "work_order_number_reservations", where: tenantRows},
	{name: "invoice_line_items", where: tenantWorkOrders},
	{name: "work_order_time_entries", where: tenantWorkOrders},
	{name: "work_order_materials", where: tenantWorkOrders},
	{name: "work_order_attachments", where: tenantWorkOrders},
	{name: "work_order_events", where: tenantWorkOrders},
	{name: "work_order_notes", where: tenantWorkOrders},
	{name: "work_order_status_history", where: tenantWorkOrders},
	{name: "work_orders", where: tenantRows, jsonColumns: []string{"payload"}},
	{name: "app_settings", where: tenantRows},
	{name: "enum_values", where: tenantRows},
	{name: "catalog_item_price_history", where: `catalog_item_id IN (SELECT id FROM catalog_items WHERE tenant_id = ?)`},
	{name: "catalog_items", where: tenantRows},
	{name: "customer_contacts", where: tenantCustomers},
	{name: "customer_emails", where: tenantCustomers},
	{name: "locations", where: tenantCustomers},
	{name: "customers", where: tenantRows},
	{name: "users", where: tenantRows, omit: []string{"password_hash"}},
}

// platformOnlyTables hold no organization data. platform_audit_events keeps
// its rows when an organization is deleted (tenant_id becomes NULL; slug and
// name are stored alongside), so the activity log outlives it.
var platformOnlyTables = map[string]bool{
	"schema_migrations":     true,
	"tenants":               true,
	"platform_admins":       true,
	"platform_sessions":     true,
	"platform_audit_events": true,
	"work_order_id_counter": true, // global id sequence
	// Superadmin sign-in state (D-021) and announcements (D-024; their per-
	// organization targeting is in tenantDataTables).
	"platform_recovery_codes":   true,
	"platform_login_challenges": true,
	"platform_announcements":    true,
}

const tenantDeleteNotSuspendedMessage = "Organizacija mora biti suspendovana pre brisanja."
const tenantDeleteConfirmMessage = "Potvrda se ne poklapa sa oznakom organizacije."

type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func loadExportTenant(ctx context.Context, db queryer, slug string) (*domain.PlatformTenantExportTenant, error) {
	var tenant domain.PlatformTenantExportTenant
	var suspended sql.NullString
	err := db.QueryRowContext(
		ctx,
		`SELECT id, slug, name, created_at, suspended_at FROM tenants WHERE slug = ? COLLATE NOCASE`,
		strings.TrimSpace(slug),
	).Scan(&tenant.ID, &tenant.Slug, &tenant.Name, &tenant.CreatedAt, &suspended)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load tenant: %w", err)
	}
	if suspended.Valid {
		tenant.SuspendedAt = &suspended.String
	}
	return &tenant, nil
}

// PlatformExportTenant reads every row the organization owns (secrets aside)
// and records the export in the activity log, in one transaction so the
// document is a consistent snapshot and an unaudited export cannot happen. It
// returns nil when no organization has that slug.
func (s *SQLiteStore) PlatformExportTenant(ctx context.Context, actor AuditActor, slug string) (*domain.PlatformTenantExport, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tenant export: %w", err)
	}
	defer tx.Rollback()

	tenant, err := loadExportTenant(ctx, tx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	export := &domain.PlatformTenantExport{
		Format:        domain.PlatformTenantExportFormat,
		FormatVersion: domain.PlatformTenantExportVersion,
		ExportedAt:    time.Now().UTC().Format(time.RFC3339),
		Tenant:        *tenant,
		Counts:        map[string]int{},
		Tables:        map[string][]map[string]any{},
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&export.SchemaVersion); err != nil {
		return nil, fmt.Errorf("read schema version: %w", err)
	}
	for i := len(tenantDataTables) - 1; i >= 0; i-- {
		table := tenantDataTables[i]
		if table.noExport {
			continue
		}
		rows, err := exportTableRows(ctx, tx, table, tenant.ID)
		if err != nil {
			return nil, err
		}
		export.Tables[table.name] = rows
		export.Counts[table.name] = len(rows)
		export.TotalRows += len(rows)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditTenantExport,
		tenant: &domain.Tenant{ID: tenant.ID, Slug: tenant.Slug, Name: tenant.Name},
		detail: map[string]string{"totalRows": strconv.Itoa(export.TotalRows)},
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tenant export: %w", err)
	}
	return export, nil
}

func exportTableRows(ctx context.Context, db queryer, table tenantDataTable, tenantID string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `SELECT * FROM `+table.name+` WHERE `+table.where+` ORDER BY 1`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("export %s: %w", table.name, err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("export %s columns: %w", table.name, err)
	}
	omit := map[string]bool{}
	for _, column := range table.omit {
		omit[column] = true
	}
	asJSON := map[string]bool{}
	for _, column := range table.jsonColumns {
		asJSON[column] = true
	}
	result := []map[string]any{}
	values := make([]any, len(columns))
	targets := make([]any, len(columns))
	for i := range values {
		targets[i] = &values[i]
	}
	for rows.Next() {
		if err := rows.Scan(targets...); err != nil {
			return nil, fmt.Errorf("export %s scan: %w", table.name, err)
		}
		row := make(map[string]any, len(columns))
		for i, column := range columns {
			if omit[column] {
				continue
			}
			value := values[i]
			if raw, ok := value.([]byte); ok {
				value = string(raw)
			}
			if text, ok := value.(string); ok && asJSON[column] && json.Valid([]byte(text)) {
				value = json.RawMessage(text)
			}
			row[column] = value
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// PlatformDeleteTenant permanently deletes a suspended organization and every
// row it owns, in one transaction, after confirmSlug matched its slug exactly.
// The activity log keeps a tenant.delete event with the organization's name,
// slug and row counts; earlier events of the organization stay too (their
// tenant reference becomes NULL). Impersonation history (impersonation_events
// and their per-request trail) is kept the same way (v30), so "Aktivnost" and
// /platform/impersonations/{id}/actions keep working for it. It returns nil
// when no organization has that slug.
func (s *SQLiteStore) PlatformDeleteTenant(ctx context.Context, actor AuditActor, slug, confirmSlug string) (*domain.PlatformTenantDeletion, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tenant delete: %w", err)
	}
	defer tx.Rollback()

	tenant, err := loadExportTenant(ctx, tx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	if tenant.SuspendedAt == nil {
		return nil, newValidationError(tenantDeleteNotSuspendedMessage)
	}
	if strings.TrimSpace(confirmSlug) != tenant.Slug {
		return nil, newValidationError(tenantDeleteConfirmMessage)
	}

	deletion := &domain.PlatformTenantDeletion{
		Slug:      tenant.Slug,
		Name:      tenant.Name,
		DeletedAt: time.Now().UTC().Format(time.RFC3339),
		Rows:      map[string]int{},
	}
	for _, table := range tenantDataTables {
		if table.keepOnDelete {
			continue
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM `+table.name+` WHERE `+table.where, tenant.ID)
		if err != nil {
			return nil, fmt.Errorf("delete %s: %w", table.name, err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return nil, fmt.Errorf("delete %s: %w", table.name, err)
		}
		deletion.Rows[table.name] = int(affected)
		deletion.TotalRows += int(affected)
	}
	// The audit row is written while the tenant still exists; deleting the
	// tenant then nulls its tenant_id like every older event's.
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditTenantDelete,
		tenant: &domain.Tenant{ID: tenant.ID, Slug: tenant.Slug, Name: tenant.Name},
		detail: map[string]string{
			"totalRows":  strconv.Itoa(deletion.TotalRows),
			"users":      strconv.Itoa(deletion.Rows["users"]),
			"customers":  strconv.Itoa(deletion.Rows["customers"]),
			"workOrders": strconv.Itoa(deletion.Rows["work_orders"]),
		},
	}); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tenants WHERE id = ?`, tenant.ID); err != nil {
		return nil, fmt.Errorf("delete tenant: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tenant delete: %w", err)
	}
	s.invalidateSettings(tenant.ID)
	s.invalidateEnums(tenant.ID)
	return deletion, nil
}
