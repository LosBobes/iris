package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
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
	// Reason is the superadmin's note on why (required by the API).
	Reason string
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
	tenant := domain.Tenant{ID: input.TenantID}
	if err := tx.QueryRowContext(ctx, `SELECT slug, name FROM tenants WHERE id = ?`, input.TenantID).Scan(&tenant.Slug, &tenant.Name); err != nil {
		return "", nil, fmt.Errorf("load tenant: %w", err)
	}
	var impersonationID int64
	err = tx.QueryRowContext(
		ctx,
		`INSERT INTO impersonation_events(admin_id, admin_username, tenant_id, tenant_slug, tenant_name, user_id, username, ip, at, expires_at, reason)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		input.AdminID, input.AdminUsername, input.TenantID, tenant.Slug, tenant.Name, user.ID, user.Username, input.IP,
		now.Format(time.RFC3339), input.ExpiresAt.UTC().Format(time.RFC3339), input.Reason,
	).Scan(&impersonationID)
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
	now := time.Now().UTC().Format(time.RFC3339)
	args = append([]any{now, now}, args...)
	if _, err := s.db.ExecContext(
		ctx,
		// A session found expired only on a later lookup ended at its expiry.
		`UPDATE impersonation_events SET ended_at = CASE WHEN expires_at < ? THEN expires_at ELSE ? END
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
// the superadmin's username as text, so it outlives the account. (Its tenant
// reference became ON DELETE SET NULL in v30, impersonationHistoryMigration.)
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

// impersonationHistoryMigration (v30) lets impersonation history outlive the
// organization: impersonation_events.tenant_id becomes nullable with ON DELETE
// SET NULL (it was NOT NULL ... ON DELETE CASCADE, which also took the
// per-request trail in impersonation_actions with it), and the organization's
// slug and name are stored on each row as they were when it started, so a row
// stays readable once its organization is gone. Existing rows are backfilled
// from tenants. impersonation_actions (ON DELETE CASCADE from its event) and
// sessions.impersonation_id need no change: events are no longer deleted, and
// a deleted organization's sessions go with its users.
//
// SQLite cannot alter a column's constraints, so there the table is rebuilt
// with foreign keys off (DROP TABLE would otherwise cascade into
// impersonation_actions); Postgres alters it in place. Either way it is one
// transaction that also records the version.
func impersonationHistoryMigration(ctx context.Context, db *sql.DB) error {
	if _, ok := db.Driver().(translatingDriver); ok {
		return impersonationHistoryMigrationPostgres(ctx, db)
	}
	// PRAGMA foreign_keys is per connection and a no-op inside a transaction,
	// so pin one connection for the pragma, the rebuild and the restore.
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("impersonation history migration: %w", err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		return fmt.Errorf("disable foreign keys: %w", err)
	}
	// Always restore enforcement, even on an error path.
	defer func() { _, _ = conn.ExecContext(context.Background(), `PRAGMA foreign_keys = ON`) }()

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin impersonation history migration: %w", err)
	}
	defer tx.Rollback()
	var sequence sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT seq FROM sqlite_sequence WHERE name = 'impersonation_events'`).Scan(&sequence); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read impersonation sequence: %w", err)
	}
	statements := []string{
		`CREATE TABLE impersonation_events_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			admin_id TEXT NOT NULL,
			admin_username TEXT NOT NULL,
			tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
			tenant_slug TEXT NOT NULL DEFAULT '',
			tenant_name TEXT NOT NULL DEFAULT '',
			user_id TEXT NOT NULL,
			username TEXT NOT NULL,
			ip TEXT,
			at TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			ended_at TEXT,
			reason TEXT NOT NULL DEFAULT ''
		)`,
		`INSERT INTO impersonation_events_new (id, admin_id, admin_username, tenant_id, tenant_slug, tenant_name,
			user_id, username, ip, at, expires_at, ended_at, reason)
		 SELECT e.id, e.admin_id, e.admin_username, e.tenant_id, COALESCE(t.slug, ''), COALESCE(t.name, ''),
			e.user_id, e.username, e.ip, e.at, e.expires_at, e.ended_at, e.reason
		 FROM impersonation_events e LEFT JOIN tenants t ON t.id = e.tenant_id`,
		`DROP TABLE impersonation_events`,
		`ALTER TABLE impersonation_events_new RENAME TO impersonation_events`,
		`CREATE INDEX idx_impersonation_events_tenant_at ON impersonation_events(tenant_id, at)`,
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("impersonation history migration: %w", err)
		}
	}
	// Keep the id sequence where it was, so an id freed by an earlier cascade
	// is never handed out again.
	if sequence.Valid {
		if _, err := tx.ExecContext(ctx, `UPDATE sqlite_sequence SET seq = ? WHERE name = 'impersonation_events' AND seq < ?`, sequence.Int64, sequence.Int64); err != nil {
			return fmt.Errorf("restore impersonation sequence: %w", err)
		}
	}
	if err := sqliteForeignKeyCheck(ctx, tx); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version) VALUES (?)`, 30); err != nil {
		return fmt.Errorf("record migration 30: %w", err)
	}
	return tx.Commit()
}

// sqliteForeignKeyCheck fails when a table rebuild left a dangling reference.
func sqliteForeignKeyCheck(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("foreign key check: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		return fmt.Errorf("foreign key check failed after rebuilding impersonation_events")
	}
	return rows.Err()
}

func impersonationHistoryMigrationPostgres(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin impersonation history migration: %w", err)
	}
	defer tx.Rollback()
	// The constraint got a generated name when v18 created the table; look it
	// up rather than assume it.
	var constraint string
	if err := tx.QueryRowContext(ctx, `SELECT conname FROM pg_constraint
		WHERE conrelid = 'impersonation_events'::regclass AND confrelid = 'tenants'::regclass AND contype = 'f'`).Scan(&constraint); err != nil {
		return fmt.Errorf("find impersonation tenant constraint: %w", err)
	}
	statements := []string{
		`ALTER TABLE impersonation_events ADD COLUMN tenant_slug TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE impersonation_events ADD COLUMN tenant_name TEXT NOT NULL DEFAULT ''`,
		`UPDATE impersonation_events SET
			tenant_slug = COALESCE((SELECT t.slug FROM tenants t WHERE t.id = impersonation_events.tenant_id), ''),
			tenant_name = COALESCE((SELECT t.name FROM tenants t WHERE t.id = impersonation_events.tenant_id), '')`,
		`ALTER TABLE impersonation_events ALTER COLUMN tenant_id DROP NOT NULL`,
		`ALTER TABLE impersonation_events DROP CONSTRAINT "` + strings.ReplaceAll(constraint, `"`, `""`) + `"`,
		`ALTER TABLE impersonation_events ADD CONSTRAINT impersonation_events_tenant_id_fkey
			FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL`,
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("impersonation history migration: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version) VALUES (?)`, 30); err != nil {
		return fmt.Errorf("record migration 30: %w", err)
	}
	return tx.Commit()
}
