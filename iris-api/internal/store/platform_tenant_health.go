package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Organization health and internal notes for the Backoffice organization list.
//
// Health is aggregates only (dates and counts), computed with one grouped
// query per source over every organization at once — never per row. Notes
// live in tenant_notes, a superadmin-only table the organization's own API
// (GET /settings and friends) never reads.

// attachTenantHealth fills Health for the given organizations. With onlyID set
// the queries are narrowed to that one organization.
func (s *SQLiteStore) attachTenantHealth(ctx context.Context, now time.Time, tenants []domain.PlatformTenant, onlyID string) error {
	if len(tenants) == 0 {
		return nil
	}
	byID := make(map[string]*domain.PlatformTenantHealth, len(tenants))
	for i := range tenants {
		byID[tenants[i].ID] = &tenants[i].Health
	}

	now = now.UTC()
	nowRaw := now.Format(time.RFC3339)
	since7 := now.AddDate(0, 0, -7).Format(time.RFC3339)
	cutoff := now.AddDate(0, 0, -domain.TenantDormantDays)
	since30 := cutoff.Format(time.RFC3339)
	since30Date := cutoff.Format("2006-01-02")

	// filter narrows a "tenant_id"-grouped query to one organization.
	filter := func(where string, args []any) (string, []any) {
		if onlyID == "" {
			return "", args
		}
		return " " + where + " tenant_id = ?", append(args, onlyID)
	}
	// Newest sign-in per organization.
	where, args := filter("WHERE", nil)
	if err := s.foldTenantRows(ctx,
		`SELECT tenant_id, MAX(at) FROM login_events`+where+` GROUP BY tenant_id`, args,
		func(rows *sql.Rows) error {
			var id string
			var last sql.NullString
			if err := rows.Scan(&id, &last); err != nil {
				return err
			}
			if health, ok := byID[id]; ok && last.Valid {
				value := last.String
				health.LastLoginAt = &value
			}
			return nil
		},
	); err != nil {
		return fmt.Errorf("tenant health logins: %w", err)
	}

	// Active users: signed in within the window, or holding a live ordinary
	// session. A live session's idle expiry is at most 7 days out and only
	// slides on use, so its holder was active within both windows; its
	// expires_at (later than now) stands in for "when" and lands in both.
	where, args = filter("WHERE", []any{since7, since30, nowRaw})
	if err := s.foldTenantRows(ctx,
		`SELECT tenant_id,
		        COUNT(DISTINCT CASE WHEN at >= ? THEN user_id END),
		        COUNT(DISTINCT user_id)
		 FROM (
		   SELECT tenant_id, user_id, at FROM login_events WHERE at >= ?
		   UNION ALL
		   SELECT users.tenant_id, sessions.user_id, sessions.expires_at
		   FROM sessions JOIN users ON users.id = sessions.user_id
		   WHERE sessions.expires_at > ? AND sessions.impersonated_by IS NULL
		 ) activity`+where+`
		 GROUP BY tenant_id`, args,
		func(rows *sql.Rows) error {
			var id string
			var week, month int
			if err := rows.Scan(&id, &week, &month); err != nil {
				return err
			}
			if health, ok := byID[id]; ok {
				health.ActiveUsers7d, health.ActiveUsers30d = week, month
			}
			return nil
		},
	); err != nil {
		return fmt.Errorf("tenant health active users: %w", err)
	}

	// Work orders created in the last 30 days, and the ones still open.
	where, args = filter("WHERE", []any{
		since30Date,
		string(domain.WorkOrderStatusCompleted), string(domain.WorkOrderStatusCancelled), string(domain.WorkOrderStatusInvoiced),
	})
	if err := s.foldTenantRows(ctx,
		`SELECT tenant_id,
		        COALESCE(SUM(CASE WHEN substr(created_at, 1, 10) >= ? THEN 1 ELSE 0 END), 0),
		        COALESCE(SUM(CASE WHEN status IN (?, ?, ?) THEN 0 ELSE 1 END), 0)
		 FROM work_orders`+where+` GROUP BY tenant_id`, args,
		func(rows *sql.Rows) error {
			var id string
			var created, open int
			if err := rows.Scan(&id, &created, &open); err != nil {
				return err
			}
			if health, ok := byID[id]; ok {
				health.WorkOrdersCreated30d, health.OpenWorkOrders = created, open
			}
			return nil
		},
	); err != nil {
		return fmt.Errorf("tenant health work orders: %w", err)
	}

	for i := range tenants {
		tenant := &tenants[i]
		created := tenant.CreatedAt
		if len(created) > 10 {
			created = created[:10]
		}
		tenant.Health.Dormant = created < since30Date && tenant.Health.ActiveUsers30d == 0
	}
	return nil
}

// foldTenantRows runs a query and hands each row to fold.
func (s *SQLiteStore) foldTenantRows(ctx context.Context, query string, args []any, fold func(rows *sql.Rows) error) error {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := fold(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

const (
	maxTenantNoteFieldLength = 200
	maxTenantNotesLength     = 10000
)

func normalizeTenantNotes(input domain.PlatformTenantNotesInput) (domain.PlatformTenantNotesInput, error) {
	out := domain.PlatformTenantNotesInput{
		ContactName:  strings.TrimSpace(input.ContactName),
		ContactEmail: strings.TrimSpace(input.ContactEmail),
		ContactPhone: strings.TrimSpace(input.ContactPhone),
		Plan:         strings.TrimSpace(input.Plan),
		Notes:        strings.TrimSpace(input.Notes),
	}
	for _, field := range []string{out.ContactName, out.ContactEmail, out.ContactPhone, out.Plan} {
		if len([]rune(field)) > maxTenantNoteFieldLength {
			return out, newValidationError("Kontakt podaci i plan mogu imati najviše 200 znakova po polju.")
		}
	}
	if len([]rune(out.Notes)) > maxTenantNotesLength {
		return out, newValidationError("Beleška je predugačka (najviše 10.000 znakova).")
	}
	if email := out.ContactEmail; email != "" {
		at := strings.Index(email, "@")
		if at < 1 || at == len(email)-1 || strings.ContainsAny(email, " \t\r\n") || strings.Count(email, "@") != 1 {
			return out, newValidationError("E-adresa kontakta nije ispravna.")
		}
	}
	return out, nil
}

// PlatformSetTenantNotes replaces the superadmins' internal notes about an
// organization and audits which fields changed (not their contents). It
// returns nil when no organization has that slug; saving identical notes
// changes nothing and writes no audit row.
func (s *SQLiteStore) PlatformSetTenantNotes(ctx context.Context, actor AuditActor, slug string, input domain.PlatformTenantNotesInput) (*domain.PlatformTenant, error) {
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	next, err := normalizeTenantNotes(input)
	if err != nil {
		return nil, err
	}
	current, err := s.platformTenantByID(ctx, tenant.ID)
	if err != nil || current == nil {
		return current, err
	}
	var changed []string
	for _, field := range []struct {
		name     string
		was, now string
	}{
		{"contactName", current.Notes.ContactName, next.ContactName},
		{"contactEmail", current.Notes.ContactEmail, next.ContactEmail},
		{"contactPhone", current.Notes.ContactPhone, next.ContactPhone},
		{"plan", current.Notes.Plan, next.Plan},
		{"notes", current.Notes.Notes, next.Notes},
	} {
		if field.was != field.now {
			changed = append(changed, field.name)
		}
	}
	if len(changed) == 0 {
		return current, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tenant notes: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO tenant_notes(tenant_id, contact_name, contact_email, contact_phone, plan_name, notes, updated_at, updated_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(tenant_id) DO UPDATE SET
		   contact_name = excluded.contact_name, contact_email = excluded.contact_email,
		   contact_phone = excluded.contact_phone, plan_name = excluded.plan_name, notes = excluded.notes,
		   updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
		tenant.ID, next.ContactName, next.ContactEmail, next.ContactPhone, next.Plan, next.Notes,
		time.Now().UTC().Format(time.RFC3339), actor.AdminUsername,
	); err != nil {
		return nil, fmt.Errorf("save tenant notes: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action: domain.AuditTenantNotes,
		tenant: tenant,
		detail: map[string]string{"fields": strings.Join(changed, ",")},
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tenant notes: %w", err)
	}
	return s.platformTenantByID(ctx, tenant.ID)
}

// tenantNotesMigration (v27) adds the Backoffice's internal notes about each
// organization: one row per organization, created on first save, removed with
// the organization.
const tenantNotesMigration = `
CREATE TABLE IF NOT EXISTS tenant_notes (
	tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
	contact_name TEXT NOT NULL DEFAULT '',
	contact_email TEXT NOT NULL DEFAULT '',
	contact_phone TEXT NOT NULL DEFAULT '',
	plan_name TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL,
	updated_by TEXT NOT NULL DEFAULT ''
);
`
