package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Organization sessions (the iris_session cookie).
//
// A session has two expiries: expires_at slides forward while it is used (the
// idle timeout, extended by the API at most once per refresh interval — see
// ExtendSession) and absolute_expires_at, which never moves and caps it. The
// remember flag records that the user asked to stay signed in on the device;
// the API picks the longer lifetimes and a persistent cookie for those.
//
// The tokens handed to browsers are never stored: sessions.token_hash holds
// their SHA-256 (hashSessionToken), so a copy of the database cannot be used
// to sign in.

// NewSession describes a session to create.
type NewSession struct {
	UserID string
	// ExpiresAt is the first idle expiry.
	ExpiresAt time.Time
	// AbsoluteExpiresAt caps every later extension. Zero means ExpiresAt.
	AbsoluteExpiresAt time.Time
	Remember          bool
}

// Session is a live session and the user it belongs to.
type Session struct {
	User              *domain.User
	ExpiresAt         time.Time
	AbsoluteExpiresAt time.Time
	Remember          bool
}

// CreateSession starts a session that ends at expiresAt and is never extended
// beyond it. Sign-ins use StartSession; this stays for callers (tests, tools)
// that only need a session.
func (s *SQLiteStore) CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error) {
	return s.StartSession(ctx, NewSession{UserID: userID, ExpiresAt: expiresAt})
}

func (s *SQLiteStore) StartSession(ctx context.Context, input NewSession) (string, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", err
	}
	absolute := input.AbsoluteExpiresAt
	if absolute.IsZero() || absolute.Before(input.ExpiresAt) {
		absolute = input.ExpiresAt
	}
	// Sessions are otherwise only deleted on logout or when an already-expired
	// token happens to be looked up, so an install with no explicit logouts
	// would grow this table forever. Sweep expired rows once per login instead
	// of adding a background job.
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM sessions WHERE expires_at <= ?`,
		time.Now().UTC().Format(time.RFC3339),
	); err != nil {
		return "", fmt.Errorf("sweep expired sessions: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO sessions(token_hash, user_id, expires_at, absolute_expires_at, remember) VALUES (?, ?, ?, ?, ?)`,
		hashSessionToken(token),
		input.UserID,
		input.ExpiresAt.UTC().Format(time.RFC3339),
		absolute.UTC().Format(time.RFC3339),
		boolInt(input.Remember), // INTEGER 0/1 column: bind an int, not a Go bool
	); err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

func (s *SQLiteStore) UserBySessionToken(ctx context.Context, token string) (*domain.User, error) {
	session, err := s.SessionByToken(ctx, token)
	if err != nil || session == nil {
		return nil, err
	}
	return session.User, nil
}

// SessionByToken returns the live session behind a cookie value, or nil when
// there is none (unknown or expired; an expired row is deleted).
func (s *SQLiteStore) SessionByToken(ctx context.Context, token string) (*Session, error) {
	var user domain.User
	var expiresAtRaw string
	var absoluteRaw sql.NullString
	var remember int
	var impersonatedBy sql.NullString
	var impersonationID sql.NullInt64
	// An impersonation session (see CreateImpersonationSession) carries the
	// superadmin who opened it; ordinary sign-ins leave impersonated_by NULL.
	err := s.db.QueryRowContext(
		ctx,
		`SELECT users.id, users.username, users.role, users.tenant_id, sessions.expires_at,
		        sessions.absolute_expires_at, sessions.remember,
		        platform_admins.username, sessions.impersonation_id, tenants.suspended_at IS NOT NULL
		 FROM sessions
		 JOIN users ON users.id = sessions.user_id
		 JOIN tenants ON tenants.id = users.tenant_id
		 LEFT JOIN platform_admins ON platform_admins.id = sessions.impersonated_by
		 WHERE sessions.token_hash = ?`,
		hashSessionToken(token),
	).Scan(&user.ID, &user.Username, &user.Role, &user.TenantID, &expiresAtRaw,
		&absoluteRaw, &remember, &impersonatedBy, &impersonationID, &user.TenantSuspended)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load session: %w", err)
	}
	expiresAt, err := time.Parse(time.RFC3339, expiresAtRaw)
	if err != nil || time.Now().UTC().After(expiresAt) {
		_ = s.DeleteSession(ctx, token)
		return nil, nil
	}
	absolute := expiresAt
	if absoluteRaw.Valid {
		if parsed, err := time.Parse(time.RFC3339, absoluteRaw.String); err == nil {
			absolute = parsed
		}
	}
	if impersonatedBy.Valid {
		user.ImpersonatedBy = &impersonatedBy.String
		user.ImpersonationID = impersonationID.Int64
	}
	return &Session{User: &user, ExpiresAt: expiresAt, AbsoluteExpiresAt: absolute, Remember: remember != 0}, nil
}

// ExtendSession moves a session's idle expiry to expiresAt. It never moves it
// past the session's absolute expiry nor backwards, and it leaves impersonation
// sessions alone (their hour is fixed).
func (s *SQLiteStore) ExtendSession(ctx context.Context, token string, expiresAt time.Time) error {
	// RFC 3339 UTC timestamps compare correctly as text.
	next := expiresAt.UTC().Format(time.RFC3339)
	if _, err := s.db.ExecContext(
		ctx,
		`UPDATE sessions
		 SET expires_at = CASE WHEN absolute_expires_at < ? THEN absolute_expires_at ELSE ? END
		 WHERE token_hash = ? AND impersonation_id IS NULL AND expires_at < ?`,
		next, next, hashSessionToken(token), next,
	); err != nil {
		return fmt.Errorf("extend session: %w", err)
	}
	return nil
}

func (s *SQLiteStore) DeleteSession(ctx context.Context, token string) error {
	hash := hashSessionToken(token)
	// Signing out of an impersonated session (or its expiry) ends that
	// impersonation in the log.
	if err := s.markImpersonationsEnded(ctx, `token_hash = ?`, hash); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, hash); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// EndUserSessions signs a user out everywhere — impersonation sessions opened
// as them included — except the session behind exceptToken (pass "" to end
// all). Used when their password changes.
func (s *SQLiteStore) EndUserSessions(ctx context.Context, userID string, exceptToken string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	keep := ""
	if exceptToken != "" {
		keep = hashSessionToken(exceptToken)
	}
	where := `user_id = ? AND token_hash <> ? AND user_id IN (SELECT id FROM users WHERE tenant_id = ?)`
	if err := s.markImpersonationsEnded(ctx, where, userID, keep, tenantID); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE `+where, userID, keep, tenantID); err != nil {
		return fmt.Errorf("end user sessions: %w", err)
	}
	return nil
}

// sessionTokenHashMigration (v25) moves organization sessions to hashed
// tokens with a sliding idle expiry under an absolute cap. Existing sessions
// hold raw tokens that can no longer be matched, so they are ended: everyone
// signs in once more after the upgrade. Any impersonation still open is closed
// in the log first.
func sessionTokenHashMigration(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin session migration: %w", err)
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(time.RFC3339)
	statements := []struct {
		sql  string
		args []any
	}{
		{
			`UPDATE impersonation_events
			 SET ended_at = CASE WHEN expires_at < ? THEN expires_at ELSE ? END
			 WHERE ended_at IS NULL AND id IN (SELECT impersonation_id FROM sessions WHERE impersonation_id IS NOT NULL)`,
			[]any{now, now},
		},
		{`DELETE FROM sessions`, nil},
		{`ALTER TABLE sessions RENAME COLUMN token TO token_hash`, nil},
		{`ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT`, nil},
		{`ALTER TABLE sessions ADD COLUMN remember INTEGER NOT NULL DEFAULT 0`, nil},
		{`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`, nil},
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement.sql, statement.args...); err != nil {
			return fmt.Errorf("session migration: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version) VALUES (?)`, 25); err != nil {
		return fmt.Errorf("record migration 25: %w", err)
	}
	return tx.Commit()
}
