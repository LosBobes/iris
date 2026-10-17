package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Impersonation: a Backoffice superadmin opens an organization session as one
// of that organization's users, to see and do exactly what that user can. The
// session is an ordinary row in sessions (so every tenant-scoped check applies
// unchanged) marked with impersonated_by, and each one is written to
// impersonation_events. It is never counted as a login.

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
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO sessions(token, user_id, expires_at, impersonated_by) VALUES (?, ?, ?, ?)`,
		token, user.ID, input.ExpiresAt.UTC().Format(time.RFC3339), input.AdminID,
	); err != nil {
		return "", nil, fmt.Errorf("create impersonation session: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO impersonation_events(admin_id, admin_username, tenant_id, user_id, username, ip, at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		input.AdminID, input.AdminUsername, input.TenantID, user.ID, user.Username, input.IP, now.Format(time.RFC3339),
	); err != nil {
		return "", nil, fmt.Errorf("record impersonation: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", nil, fmt.Errorf("commit impersonation: %w", err)
	}
	user.ImpersonatedBy = &input.AdminUsername
	return token, user, nil
}

func (s *SQLiteStore) EndImpersonationSessions(ctx context.Context, adminID string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE impersonated_by = ?`, adminID); err != nil {
		return fmt.Errorf("end impersonation sessions: %w", err)
	}
	return nil
}

// ImpersonationEvent is one row of the impersonation audit log.
type ImpersonationEvent struct {
	AdminUsername string
	TenantID      string
	UserID        string
	Username      string
	IP            string
	At            string
}

// ImpersonationEvents returns the audit log, newest first (for irisctl and tests).
func (s *SQLiteStore) ImpersonationEvents(ctx context.Context, limit int) ([]ImpersonationEvent, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT admin_username, tenant_id, user_id, username, ip, at
		 FROM impersonation_events ORDER BY id DESC LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list impersonation events: %w", err)
	}
	defer rows.Close()
	events := []ImpersonationEvent{}
	for rows.Next() {
		var event ImpersonationEvent
		var ip sql.NullString
		if err := rows.Scan(&event.AdminUsername, &event.TenantID, &event.UserID, &event.Username, &ip, &event.At); err != nil {
			return nil, fmt.Errorf("scan impersonation event: %w", err)
		}
		event.IP = ip.String
		events = append(events, event)
	}
	return events, rows.Err()
}

// platformImpersonationMigration marks impersonation sessions and adds their
// audit log. The log keeps the superadmin's username as text, so it outlives
// the account; it goes with the organization when that is deleted.
const platformImpersonationMigration = `
ALTER TABLE sessions ADD COLUMN impersonated_by TEXT REFERENCES platform_admins(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sessions_impersonated_by ON sessions(impersonated_by);

CREATE TABLE IF NOT EXISTS impersonation_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	admin_id TEXT NOT NULL,
	admin_username TEXT NOT NULL,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL,
	username TEXT NOT NULL,
	ip TEXT,
	at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_impersonation_events_tenant_at ON impersonation_events(tenant_id, at);
`
