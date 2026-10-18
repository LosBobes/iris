package store

import (
	"context"
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Impersonation: a Backoffice superadmin opens an organization session as one
// of that organization's users, to see and do exactly what that user can. The
// session is an ordinary row in sessions (so every tenant-scoped check applies
// unchanged) marked with impersonated_by and linked to its impersonation_events
// row (and to its platform_audit_events entry), and every change request made
// in it is written to impersonation_actions.
// It is never counted as a login.

// ImpersonationInput describes one impersonation request.
type ImpersonationInput struct {
	AdminID       string
	AdminUsername string
	TenantID      string
	UserID        string
	IP            string
	ExpiresAt     time.Time
}

func (s *SQLiteStore) PlatformTenantUsers(ctx context.Context, slug string) (*domain.PlatformTenantUsers, error) {
	tenant, err := s.TenantBySlug(ctx, slug)
	if err != nil || tenant == nil {
		return nil, err
	}
	users, err := s.ListUsers(ContextWithTenant(ctx, tenant.ID))
	if err != nil {
		return nil, err
	}
	return &domain.PlatformTenantUsers{Tenant: *tenant, Users: users}, nil
}

func (s *SQLiteStore) CreateImpersonationSession(ctx context.Context, input ImpersonationInput) (string, *domain.User, error) {
	user, err := s.UserByID(ContextWithTenant(ctx, input.TenantID), input.UserID)
	if err != nil || user == nil {
		return "", nil, err
	}
	token, err := newSessionToken()
	if err != nil {
		return "", nil, err
	}
	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", nil, fmt.Errorf("begin impersonation: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM sessions WHERE expires_at <= ?`,
		now.Format(time.RFC3339),
	); err != nil {
		return "", nil, fmt.Errorf("sweep expired sessions: %w", err)
	}
	result, err := tx.ExecContext(
		ctx,
		`INSERT INTO impersonation_events(admin_id, admin_username, tenant_id, user_id, username, ip, at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		input.AdminID, input.AdminUsername, input.TenantID, user.ID, user.Username, input.IP,
		now.Format(time.RFC3339), input.ExpiresAt.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return "", nil, fmt.Errorf("record impersonation: %w", err)
	}
	impersonationID, err := result.LastInsertId()
	if err != nil {
		return "", nil, fmt.Errorf("record impersonation: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		// Fixed lifetime: the idle and absolute expiry are the same and it is
		// never extended (see ExtendSession).
		`INSERT INTO sessions(token_hash, user_id, expires_at, absolute_expires_at, impersonated_by, impersonation_id) VALUES (?, ?, ?, ?, ?, ?)`,
		hashSessionToken(token), user.ID, input.ExpiresAt.UTC().Format(time.RFC3339), input.ExpiresAt.UTC().Format(time.RFC3339), input.AdminID, impersonationID,
	); err != nil {
		return "", nil, fmt.Errorf("create impersonation session: %w", err)
	}
	tenant := domain.Tenant{ID: input.TenantID}
	if err := tx.QueryRowContext(ctx, `SELECT slug, name FROM tenants WHERE id = ?`, input.TenantID).Scan(&tenant.Slug, &tenant.Name); err != nil {
		return "", nil, fmt.Errorf("load tenant: %w", err)
	}
	if err := writeAudit(ctx, tx, AuditActor{AdminID: input.AdminID, AdminUsername: input.AdminUsername, IP: input.IP}, auditEntry{
		action:          domain.AuditImpersonationStart,
		tenant:          &tenant,
		targetUserID:    user.ID,
		targetUsername:  user.Username,
		impersonationID: impersonationID,
	}); err != nil {
		return "", nil, err
	}
	if err := tx.Commit(); err != nil {
		return "", nil, fmt.Errorf("commit impersonation: %w", err)
	}
	user.ImpersonatedBy = &input.AdminUsername
	user.ImpersonationID = impersonationID
	return token, user, nil
}

// markImpersonationsEnded stamps ended_at on the impersonations behind the
// sessions matched by where (a condition on sessions) before they are deleted.
func (s *SQLiteStore) markImpersonationsEnded(ctx context.Context, where string, args ...any) error {
	args = append([]any{time.Now().UTC().Format(time.RFC3339)}, args...)
	if _, err := s.db.ExecContext(
		ctx,
		// A session found expired only on a later lookup ended at its expiry.
		`UPDATE impersonation_events SET ended_at = MIN(?, expires_at)
		 WHERE ended_at IS NULL AND id IN (SELECT impersonation_id FROM sessions WHERE impersonation_id IS NOT NULL AND `+where+`)`,
		args...,
	); err != nil {
		return fmt.Errorf("end impersonation: %w", err)
	}
	return nil
}

func (s *SQLiteStore) EndImpersonationSessions(ctx context.Context, adminID string) error {
	if err := s.markImpersonationsEnded(ctx, `impersonated_by = ?`, adminID); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE impersonated_by = ?`, adminID); err != nil {
		return fmt.Errorf("end impersonation sessions: %w", err)
	}
	return nil
}

// RecordImpersonationAction adds one change request to an impersonation's trail.
func (s *SQLiteStore) RecordImpersonationAction(ctx context.Context, impersonationID int64, action domain.PlatformImpersonationAction) error {
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO impersonation_actions(impersonation_id, at, method, route, path, status) VALUES (?, ?, ?, ?, ?, ?)`,
		impersonationID, action.At, action.Method, action.Route, action.Path, action.Status,
	); err != nil {
		return fmt.Errorf("record impersonation action: %w", err)
	}
	return nil
}

func (s *SQLiteStore) ImpersonationActions(ctx context.Context, impersonationID int64) ([]domain.PlatformImpersonationAction, bool, error) {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM impersonation_events WHERE id = ?`, impersonationID).Scan(&exists); err != nil {
		return nil, false, fmt.Errorf("load impersonation: %w", err)
	}
	if exists == 0 {
		return nil, false, nil
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT at, method, route, path, status FROM impersonation_actions WHERE impersonation_id = ? ORDER BY id`,
		impersonationID,
	)
	if err != nil {
		return nil, true, fmt.Errorf("list impersonation actions: %w", err)
	}
	defer rows.Close()
	actions := []domain.PlatformImpersonationAction{}
	for rows.Next() {
		var action domain.PlatformImpersonationAction
		if err := rows.Scan(&action.At, &action.Method, &action.Route, &action.Path, &action.Status); err != nil {
			return nil, true, fmt.Errorf("scan impersonation action: %w", err)
		}
		actions = append(actions, action)
	}
	return actions, true, rows.Err()
}

// platformImpersonationMigration adds the impersonation audit log and its
// per-request trail, and links impersonation sessions to them. The log keeps
// the superadmin's username as text, so it outlives the account; it goes with
// the organization when that is deleted.
const platformImpersonationMigration = `
CREATE TABLE IF NOT EXISTS impersonation_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	admin_id TEXT NOT NULL,
	admin_username TEXT NOT NULL,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL,
	username TEXT NOT NULL,
	ip TEXT,
	at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_impersonation_events_tenant_at ON impersonation_events(tenant_id, at);

CREATE TABLE IF NOT EXISTS impersonation_actions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	impersonation_id INTEGER NOT NULL REFERENCES impersonation_events(id) ON DELETE CASCADE,
	at TEXT NOT NULL,
	method TEXT NOT NULL,
	route TEXT NOT NULL,
	path TEXT NOT NULL,
	status INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_impersonation_actions_impersonation ON impersonation_actions(impersonation_id);

ALTER TABLE sessions ADD COLUMN impersonated_by TEXT REFERENCES platform_admins(id) ON DELETE CASCADE;

ALTER TABLE sessions ADD COLUMN impersonation_id INTEGER REFERENCES impersonation_events(id);

CREATE INDEX IF NOT EXISTS idx_sessions_impersonated_by ON sessions(impersonated_by);
`
