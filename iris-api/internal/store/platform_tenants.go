package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

// Backoffice organization management: create, rename, suspend and reactivate
// organizations and reset a user's password. Every operation writes a
// platform_audit_events row in the same transaction, so the activity log
// cannot miss one.

// AuditActor is the superadmin performing a Backoffice operation.
type AuditActor struct {
	AdminID       string
	AdminUsername string
	IP            string
}

// tenantSlugPattern is what a new or changed slug must look like: it becomes
// the /login/<slug> address, so lowercase letters, digits and inner dashes.
var tenantSlugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

const duplicateTenantSlugMessage = "Organizacija sa tom oznakom već postoji."

func normalizeTenantSlug(slug string) (string, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if len(slug) < 2 || len(slug) > 64 || !tenantSlugPattern.MatchString(slug) {
		return "", newValidationError("Oznaka mora imati 2–64 znaka: mala slova, cifre i crtice (npr. stamparija-novi-sad).")
	}
	return slug, nil
}

func normalizeTenantName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", newValidationError("Naziv organizacije je obavezan.")
	}
	if len([]rune(name)) > 120 {
		return "", newValidationError("Naziv organizacije je predugačak (najviše 120 znakova).")
	}
	return name, nil
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type auditEntry struct {
	action          string
	tenant          *domain.Tenant
	targetUserID    string
	targetUsername  string
	detail          map[string]string
	impersonationID int64
}

func writeAudit(ctx context.Context, db execer, actor AuditActor, entry auditEntry) error {
	var detail, targetUserID, targetUsername, tenantID any
	if len(entry.detail) > 0 {
		raw, err := json.Marshal(entry.detail)
		if err != nil {
			return fmt.Errorf("encode audit detail: %w", err)
		}
		detail = string(raw)
	}
	if entry.targetUserID != "" {
		targetUserID, targetUsername = entry.targetUserID, entry.targetUsername
	}
	var impersonationID any
	if entry.impersonationID != 0 {
		impersonationID = entry.impersonationID
	}
	slug, name := "", ""
	if entry.tenant != nil {
		tenantID, slug, name = entry.tenant.ID, entry.tenant.Slug, entry.tenant.Name
	}
	if _, err := db.ExecContext(
		ctx,
		`INSERT INTO platform_audit_events(at, admin_id, admin_username, action, tenant_id, tenant_slug, tenant_name,
		                                   target_user_id, target_username, detail, ip, impersonation_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		time.Now().UTC().Format(time.RFC3339), actor.AdminID, actor.AdminUsername, entry.action, tenantID, slug, name,
		targetUserID, targetUsername, detail, actor.IP, impersonationID,
	); err != nil {
		return fmt.Errorf("write audit event: %w", err)
	}
	return nil
}

const platformTenantSelect = `
	SELECT t.id, t.slug, t.name, t.created_at, t.suspended_at,
	       (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id),
	       (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.role = 'admin'),
	       (SELECT s.value FROM app_settings s WHERE s.tenant_id = t.id AND s.key = 'modules'),
	       n.contact_name, n.contact_email, n.contact_phone, n.plan_name, n.notes, n.updated_at, n.updated_by
	FROM tenants t
	LEFT JOIN tenant_notes n ON n.tenant_id = t.id`

func scanPlatformTenant(row interface{ Scan(...any) error }) (domain.PlatformTenant, error) {
	var tenant domain.PlatformTenant
	var suspended, modules sql.NullString
	var contactName, contactEmail, contactPhone, plan, notes, notesUpdatedAt, notesUpdatedBy sql.NullString
	err := row.Scan(&tenant.ID, &tenant.Slug, &tenant.Name, &tenant.CreatedAt, &suspended, &tenant.Users, &tenant.Admins, &modules,
		&contactName, &contactEmail, &contactPhone, &plan, &notes, &notesUpdatedAt, &notesUpdatedBy)
	tenant.Notes = domain.PlatformTenantNotes{
		ContactName:  contactName.String,
		ContactEmail: contactEmail.String,
		ContactPhone: contactPhone.String,
		Plan:         plan.String,
		Notes:        notes.String,
	}
	if notesUpdatedAt.Valid {
		tenant.Notes.UpdatedAt, tenant.Notes.UpdatedBy = &notesUpdatedAt.String, &notesUpdatedBy.String
	}
	if modules.Valid {
		tenant.Modules = parseModules(modules.String)
	}
	if suspended.Valid {
		tenant.SuspendedAt = &suspended.String
	}
	return tenant, err
}

func (s *SQLiteStore) PlatformTenants(ctx context.Context) ([]domain.PlatformTenant, error) {
	rows, err := s.db.QueryContext(ctx, platformTenantSelect+` ORDER BY t.name COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	defer rows.Close()
	tenants := []domain.PlatformTenant{}
	for rows.Next() {
		tenant, err := scanPlatformTenant(rows)
		if err != nil {
			return nil, fmt.Errorf("scan tenant: %w", err)
		}
		tenants = append(tenants, tenant)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	if err := s.attachTenantHealth(ctx, time.Now(), tenants, ""); err != nil {
		return nil, err
	}
	return tenants, nil
}

func (s *SQLiteStore) platformTenantByID(ctx context.Context, id string) (*domain.PlatformTenant, error) {
	tenant, err := scanPlatformTenant(s.db.QueryRowContext(ctx, platformTenantSelect+` WHERE t.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load tenant: %w", err)
	}
	one := []domain.PlatformTenant{tenant}
	if err := s.attachTenantHealth(ctx, time.Now(), one, tenant.ID); err != nil {
		return nil, err
	}
	return &one[0], nil
}

// PlatformCreateTenant creates an organization and its first admin account.
func (s *SQLiteStore) PlatformCreateTenant(ctx context.Context, actor AuditActor, input domain.PlatformCreateTenantInput) (*domain.PlatformTenant, error) {
	name, err := normalizeTenantName(input.Name)
	if err != nil {
		return nil, err
	}
	slug, err := normalizeTenantSlug(input.Slug)
	if err != nil {
		return nil, err
	}
	username := strings.TrimSpace(input.AdminUsername)
	if username == "" {
		return nil, newValidationError("Korisničko ime administratora je obavezno.")
	}
	if err := validateUserPassword(input.AdminPassword); err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	userID, err := newUserID()
	if err != nil {
		return nil, err
	}
	tenant := domain.Tenant{ID: "tenant-" + slug, Slug: slug, Name: name}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create tenant: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO tenants(id, slug, name) VALUES (?, ?, ?)`, tenant.ID, tenant.Slug, tenant.Name); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError(duplicateTenantSlugMessage)
		}
		return nil, fmt.Errorf("create tenant: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO users(id, tenant_id, username, password_hash, role, is_demo, updated_at)
		 VALUES (?, ?, ?, ?, 'admin', 0, CURRENT_TIMESTAMP)`,
		userID, tenant.ID, username, string(hash),
	); err != nil {
		return nil, fmt.Errorf("create tenant admin: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action:         domain.AuditTenantCreate,
		tenant:         &tenant,
		targetUserID:   userID,
		targetUsername: username,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create tenant: %w", err)
	}
	return s.platformTenantByID(ctx, tenant.ID)
}

// PlatformUpdateTenant renames an organization and/or changes its slug. It
// returns nil when no organization has that slug.
func (s *SQLiteStore) PlatformUpdateTenant(ctx context.Context, actor AuditActor, slug string, input domain.PlatformUpdateTenantInput) (*domain.PlatformTenant, error) {
	current, err := s.TenantBySlug(ctx, slug)
	if err != nil || current == nil {
		return nil, err
	}
	next := *current
	detail := map[string]string{}
	if input.Name != nil {
		if next.Name, err = normalizeTenantName(*input.Name); err != nil {
			return nil, err
		}
		if next.Name != current.Name {
			detail["fromName"], detail["toName"] = current.Name, next.Name
		}
	}
	if input.Slug != nil {
		if next.Slug, err = normalizeTenantSlug(*input.Slug); err != nil {
			return nil, err
		}
		if next.Slug != current.Slug {
			detail["fromSlug"], detail["toSlug"] = current.Slug, next.Slug
		}
	}
	if len(detail) == 0 {
		return s.platformTenantByID(ctx, current.ID)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin update tenant: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE tenants SET name = ?, slug = ? WHERE id = ?`, next.Name, next.Slug, current.ID); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError(duplicateTenantSlugMessage)
		}
		return nil, fmt.Errorf("update tenant: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{action: domain.AuditTenantUpdate, tenant: &next, detail: detail}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update tenant: %w", err)
	}
	return s.platformTenantByID(ctx, current.ID)
}

// PlatformSetTenantSuspended suspends (ending every ordinary session of its
// users) or reactivates an organization. Impersonation is unaffected. It
// returns nil when no organization has that slug; repeating the current state
// changes nothing and writes no audit row.
func (s *SQLiteStore) PlatformSetTenantSuspended(ctx context.Context, actor AuditActor, slug string, suspended bool) (*domain.PlatformTenant, error) {
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	if tenant.Suspended == suspended {
		return s.platformTenantByID(ctx, tenant.ID)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin suspend tenant: %w", err)
	}
	defer tx.Rollback()
	action := domain.AuditTenantReactivate
	var suspendedAt any
	if suspended {
		action = domain.AuditTenantSuspend
		suspendedAt = time.Now().UTC().Format(time.RFC3339)
		if _, err := tx.ExecContext(
			ctx,
			`DELETE FROM sessions WHERE impersonation_id IS NULL
			 AND user_id IN (SELECT id FROM users WHERE tenant_id = ?)`,
			tenant.ID,
		); err != nil {
			return nil, fmt.Errorf("end tenant sessions: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE tenants SET suspended_at = ? WHERE id = ?`, suspendedAt, tenant.ID); err != nil {
		return nil, fmt.Errorf("suspend tenant: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{action: action, tenant: tenant}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit suspend tenant: %w", err)
	}
	return s.platformTenantByID(ctx, tenant.ID)
}

// PlatformResetUserPassword sets a new password for a user of the
// organization and signs that user out everywhere (impersonation aside). It
// returns a nil user when the organization or the user does not exist.
func (s *SQLiteStore) PlatformResetUserPassword(ctx context.Context, actor AuditActor, slug, userID, password string) (*domain.User, error) {
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	user, err := s.UserByID(ContextWithTenant(ctx, tenant.ID), userID)
	if err != nil || user == nil {
		return nil, err
	}
	if err := validateUserPassword(password); err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin password reset: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
		string(hash), user.ID, tenant.ID,
	); err != nil {
		return nil, fmt.Errorf("reset password: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND impersonation_id IS NULL`, user.ID); err != nil {
		return nil, fmt.Errorf("end user sessions: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action:         domain.AuditUserPasswordReset,
		tenant:         tenant,
		targetUserID:   user.ID,
		targetUsername: user.Username,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit password reset: %w", err)
	}
	return user, nil
}

// PlatformAuditLog lists Backoffice activity, newest first.
func (s *SQLiteStore) PlatformAuditLog(ctx context.Context, limit, offset int) (domain.PlatformAuditLog, error) {
	log := domain.PlatformAuditLog{Items: []domain.PlatformAuditEvent{}}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM platform_audit_events`).Scan(&log.Total); err != nil {
		return log, fmt.Errorf("count audit events: %w", err)
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT a.id, a.at, a.admin_username, a.action, a.tenant_slug, a.tenant_name,
		        COALESCE(a.target_username, ''), a.detail, COALESCE(a.ip, ''),
		        e.id, e.expires_at, e.ended_at, COALESCE(e.reason, ''),
		        (SELECT COUNT(*) FROM impersonation_actions x WHERE x.impersonation_id = e.id)
		 FROM platform_audit_events a
		 LEFT JOIN impersonation_events e ON e.id = a.impersonation_id
		 ORDER BY a.id DESC LIMIT ? OFFSET ?`,
		limit, offset,
	)
	if err != nil {
		return log, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var event domain.PlatformAuditEvent
		var detail, expiresAt, endedAt sql.NullString
		var impersonationID sql.NullInt64
		var reason string
		var actionCount int
		if err := rows.Scan(
			&event.ID, &event.At, &event.AdminUsername, &event.Action, &event.TenantSlug, &event.TenantName,
			&event.TargetUsername, &detail, &event.IP, &impersonationID, &expiresAt, &endedAt, &reason, &actionCount,
		); err != nil {
			return log, fmt.Errorf("scan audit event: %w", err)
		}
		if detail.Valid && detail.String != "" {
			if err := json.Unmarshal([]byte(detail.String), &event.Detail); err != nil {
				return log, fmt.Errorf("decode audit detail: %w", err)
			}
		}
		if impersonationID.Valid {
			status := &domain.PlatformImpersonationStatus{
				ID:          impersonationID.Int64,
				ExpiresAt:   expiresAt.String,
				ActionCount: actionCount,
				Reason:      reason,
			}
			if endedAt.Valid {
				status.EndedAt = &endedAt.String
			}
			event.Impersonation = status
		}
		log.Items = append(log.Items, event)
	}
	return log, rows.Err()
}

// platformManagementMigration adds organization suspension and the Backoffice
// activity log, and carries the impersonations recorded so far into it.
const platformManagementMigration = `
ALTER TABLE tenants ADD COLUMN suspended_at TEXT;

CREATE TABLE IF NOT EXISTS platform_audit_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	at TEXT NOT NULL,
	admin_id TEXT NOT NULL,
	admin_username TEXT NOT NULL,
	action TEXT NOT NULL,
	tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
	tenant_slug TEXT NOT NULL DEFAULT '',
	tenant_name TEXT NOT NULL DEFAULT '',
	target_user_id TEXT,
	target_username TEXT,
	detail TEXT,
	ip TEXT,
	impersonation_id INTEGER REFERENCES impersonation_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_tenant ON platform_audit_events(tenant_id);

INSERT INTO platform_audit_events(at, admin_id, admin_username, action, tenant_id, tenant_slug, tenant_name,
                                  target_user_id, target_username, ip, impersonation_id)
SELECT e.at, e.admin_id, e.admin_username, 'impersonate', e.tenant_id, t.slug, t.name, e.user_id, e.username, e.ip, e.id
FROM impersonation_events e JOIN tenants t ON t.id = e.tenant_id
ORDER BY e.id;
`
