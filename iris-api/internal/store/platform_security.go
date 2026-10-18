package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

// Superadmin hardening (D-021): TOTP two-factor sign-in with one-time recovery
// codes, the short-lived challenge between the password and code steps, and
// superadmin account management (create, disable, enable). Every change is
// written to platform_audit_events, as are failed sign-ins and sign-ins with
// a recovery code.
//
// TOTP secrets are stored as given (base32): the server must be able to compute
// codes, and Iris has no key to encrypt them with. Recovery codes and challenge
// tokens are stored only as SHA-256.

const (
	// TOTPPeriod and TOTPDigits are the authenticator-app defaults (RFC 6238).
	TOTPPeriod = 30
	TOTPDigits = 6
	// RecoveryCodeCount codes are issued on enrollment; each works once.
	RecoveryCodeCount = 10
	// PlatformLoginChallengeTTL bounds the time between the password and the
	// code step.
	PlatformLoginChallengeTTL = 5 * time.Minute
	// TOTPIssuer names the account in the authenticator app.
	TOTPIssuer = "Iris Backoffice"
)

var (
	// ErrInvalidTwoFactorCode reports a wrong, reused or expired code.
	ErrInvalidTwoFactorCode = errors.New("invalid two-factor code")
	// ErrPlatformChallengeInvalid reports an unknown or expired login challenge.
	ErrPlatformChallengeInvalid = errors.New("invalid login challenge")
)

// recoveryCodeAlphabet leaves out look-alikes (0/o, 1/l/i).
const recoveryCodeAlphabet = "abcdefghjkmnpqrstuvwxyz23456789"

func newRecoveryCode() (string, error) {
	raw := make([]byte, 10)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate recovery code: %w", err)
	}
	out := make([]byte, 0, 11)
	for i, b := range raw {
		if i == 5 {
			out = append(out, '-')
		}
		out = append(out, recoveryCodeAlphabet[int(b)%len(recoveryCodeAlphabet)])
	}
	return string(out), nil
}

// normalizeRecoveryCode ignores case, spaces and dashes.
func normalizeRecoveryCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(code) {
		if r == '-' || r == ' ' {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(normalizeRecoveryCode(code)))
	return hex.EncodeToString(sum[:])
}

// totpCodeStep returns the time step the code is valid for, checking the
// current step and one on either side (clock drift), or -1 when none matches.
func totpCodeStep(secret, code string, now time.Time) int64 {
	code = strings.ReplaceAll(strings.TrimSpace(code), " ", "")
	if len(code) != TOTPDigits {
		return -1
	}
	current := now.Unix() / TOTPPeriod
	for _, step := range []int64{current, current - 1, current + 1} {
		expected, err := totp.GenerateCodeCustom(secret, time.Unix(step*TOTPPeriod, 0), totp.ValidateOpts{
			Period:    TOTPPeriod,
			Digits:    otp.DigitsSix,
			Algorithm: otp.AlgorithmSHA1,
		})
		if err == nil && expected == code {
			return step
		}
	}
	return -1
}

// SetPlatformTOTPPending stores a freshly generated secret as the admin's
// pending enrollment, replacing any earlier unconfirmed one. It refuses when
// two-factor sign-in is already on.
func (s *SQLiteStore) SetPlatformTOTPPending(ctx context.Context, adminID, secret string) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE platform_admins SET totp_pending_secret = ? WHERE id = ? AND totp_enabled_at IS NULL`,
		secret, adminID,
	)
	if err != nil {
		return fmt.Errorf("store pending totp: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return newValidationError("Dvofaktorska prijava je već uključena.")
	}
	return nil
}

// EnablePlatformTOTP confirms the pending enrollment with a code from the
// app, turns two-factor sign-in on and issues fresh recovery codes (returned
// once, stored hashed). ErrInvalidTwoFactorCode means the code did not match.
func (s *SQLiteStore) EnablePlatformTOTP(ctx context.Context, actor AuditActor, code string, now time.Time) ([]string, error) {
	var pending sql.NullString
	var enabledAt sql.NullString
	err := s.db.QueryRowContext(
		ctx,
		`SELECT totp_pending_secret, totp_enabled_at FROM platform_admins WHERE id = ?`,
		actor.AdminID,
	).Scan(&pending, &enabledAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvalidTwoFactorCode
	}
	if err != nil {
		return nil, fmt.Errorf("load pending totp: %w", err)
	}
	if enabledAt.Valid {
		return nil, newValidationError("Dvofaktorska prijava je već uključena.")
	}
	if !pending.Valid || pending.String == "" {
		return nil, newValidationError("Najpre započnite podešavanje dvofaktorske prijave.")
	}
	step := totpCodeStep(pending.String, code, now)
	if step < 0 {
		return nil, ErrInvalidTwoFactorCode
	}
	codes := make([]string, RecoveryCodeCount)
	for i := range codes {
		if codes[i], err = newRecoveryCode(); err != nil {
			return nil, err
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin totp enable: %w", err)
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(
		ctx,
		`UPDATE platform_admins SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
		        totp_enabled_at = ?, totp_last_step = ?
		 WHERE id = ? AND totp_enabled_at IS NULL AND totp_pending_secret = ?`,
		now.UTC().Format(time.RFC3339), step, actor.AdminID, pending.String,
	)
	if err != nil {
		return nil, fmt.Errorf("enable totp: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		// A concurrent enrollment replaced the secret this code was for.
		return nil, ErrInvalidTwoFactorCode
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM platform_recovery_codes WHERE admin_id = ?`, actor.AdminID); err != nil {
		return nil, fmt.Errorf("clear recovery codes: %w", err)
	}
	for _, c := range codes {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO platform_recovery_codes(admin_id, code_hash) VALUES (?, ?)`,
			actor.AdminID, hashRecoveryCode(c),
		); err != nil {
			return nil, fmt.Errorf("store recovery code: %w", err)
		}
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action:         domain.AuditAdminTwoFactorOn,
		targetUserID:   actor.AdminID,
		targetUsername: actor.AdminUsername,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit totp enable: %w", err)
	}
	return codes, nil
}

// ResetPlatformAdminTOTP turns two-factor sign-in off for the account (secret,
// pending enrollment and recovery codes removed) and ends its sessions, for an
// admin who lost the authenticator. It is the server-side recovery path
// (`irisctl reset-platform-2fa`). ErrPlatformAdminNotFound when no such account.
func (s *SQLiteStore) ResetPlatformAdminTOTP(ctx context.Context, actor AuditActor, username string) error {
	var id, name string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username FROM platform_admins WHERE username = ?`,
		strings.TrimSpace(username),
	).Scan(&id, &name)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrPlatformAdminNotFound
	}
	if err != nil {
		return fmt.Errorf("load platform admin: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin totp reset: %w", err)
	}
	defer tx.Rollback()
	statements := []string{
		`UPDATE platform_admins SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ?`,
		`DELETE FROM platform_recovery_codes WHERE admin_id = ?`,
		`DELETE FROM platform_login_challenges WHERE admin_id = ?`,
		`DELETE FROM platform_sessions WHERE admin_id = ?`,
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement, id); err != nil {
			return fmt.Errorf("reset totp: %w", err)
		}
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action:         domain.AuditAdminTwoFactorReset,
		targetUserID:   id,
		targetUsername: name,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// CreatePlatformLoginChallenge records that the admin passed the password
// step; the returned token, with a code, completes the sign-in.
func (s *SQLiteStore) CreatePlatformLoginChallenge(ctx context.Context, adminID string, expiresAt time.Time) (string, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`DELETE FROM platform_login_challenges WHERE expires_at <= ?`,
		time.Now().UTC().Format(time.RFC3339),
	); err != nil {
		return "", fmt.Errorf("sweep login challenges: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO platform_login_challenges(token_hash, admin_id, expires_at) VALUES (?, ?, ?)`,
		hashSessionToken(token), adminID, expiresAt.UTC().Format(time.RFC3339),
	); err != nil {
		return "", fmt.Errorf("create login challenge: %w", err)
	}
	return token, nil
}

// PlatformLoginChallengeAdmin returns the admin a live challenge belongs to,
// or ErrPlatformChallengeInvalid.
func (s *SQLiteStore) PlatformLoginChallengeAdmin(ctx context.Context, challenge string, now time.Time) (string, error) {
	if challenge == "" {
		return "", ErrPlatformChallengeInvalid
	}
	var adminID string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT c.admin_id FROM platform_login_challenges c
		 JOIN platform_admins a ON a.id = c.admin_id
		 WHERE c.token_hash = ? AND c.expires_at > ? AND a.disabled_at IS NULL`,
		hashSessionToken(challenge), now.UTC().Format(time.RFC3339),
	).Scan(&adminID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrPlatformChallengeInvalid
	}
	if err != nil {
		return "", fmt.Errorf("load login challenge: %w", err)
	}
	return adminID, nil
}

// VerifyPlatformLoginChallenge completes a two-factor sign-in. code is either
// a TOTP code (each time step is accepted once) or an unused recovery code
// (then used up). On success the challenge is consumed and the admin returned
// with the method used ("totp" or "recovery"); a wrong code returns
// ErrInvalidTwoFactorCode and leaves the challenge for another try.
func (s *SQLiteStore) VerifyPlatformLoginChallenge(ctx context.Context, challenge, code string, now time.Time) (*domain.PlatformAdmin, string, error) {
	adminID, err := s.PlatformLoginChallengeAdmin(ctx, challenge, now)
	if err != nil {
		return nil, "", err
	}
	admin, secret, lastStep, err := s.platformAdminTOTP(ctx, adminID)
	if err != nil {
		return nil, "", err
	}
	if admin == nil || secret == "" {
		return nil, "", ErrPlatformChallengeInvalid
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", fmt.Errorf("begin login verify: %w", err)
	}
	defer tx.Rollback()
	method := ""
	if step := totpCodeStep(secret, code, now); step >= 0 && step > lastStep {
		// Conditional on the step not having moved: two requests with the
		// same code cannot both pass.
		result, err := tx.ExecContext(
			ctx,
			`UPDATE platform_admins SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?`,
			step, adminID, step,
		)
		if err != nil {
			return nil, "", fmt.Errorf("record totp step: %w", err)
		}
		if n, _ := result.RowsAffected(); n == 1 {
			method = "totp"
		}
	} else if normalized := normalizeRecoveryCode(code); len(normalized) == 10 {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE platform_recovery_codes SET used_at = ? WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL`,
			now.UTC().Format(time.RFC3339), adminID, hashRecoveryCode(normalized),
		)
		if err != nil {
			return nil, "", fmt.Errorf("use recovery code: %w", err)
		}
		if n, _ := result.RowsAffected(); n == 1 {
			method = "recovery"
		}
	}
	if method == "" {
		return nil, "", ErrInvalidTwoFactorCode
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM platform_login_challenges WHERE token_hash = ?`, hashSessionToken(challenge)); err != nil {
		return nil, "", fmt.Errorf("consume login challenge: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, "", fmt.Errorf("commit login verify: %w", err)
	}
	return admin, method, nil
}

// RemainingRecoveryCodes counts the admin's unused recovery codes.
func (s *SQLiteStore) RemainingRecoveryCodes(ctx context.Context, adminID string) (int, error) {
	var count int
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM platform_recovery_codes WHERE admin_id = ? AND used_at IS NULL`,
		adminID,
	).Scan(&count); err != nil {
		return 0, fmt.Errorf("count recovery codes: %w", err)
	}
	return count, nil
}

func (s *SQLiteStore) platformAdminTOTP(ctx context.Context, adminID string) (*domain.PlatformAdmin, string, int64, error) {
	var admin domain.PlatformAdmin
	var secret sql.NullString
	var lastStep int64
	err := s.db.QueryRowContext(
		ctx,
		`SELECT id, username, must_change_password, role, totp_secret, totp_last_step
		 FROM platform_admins WHERE id = ? AND disabled_at IS NULL`,
		adminID,
	).Scan(&admin.ID, &admin.Username, &admin.MustChangePassword, &admin.Role, &secret, &lastStep)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", 0, nil
	}
	if err != nil {
		return nil, "", 0, fmt.Errorf("load platform admin: %w", err)
	}
	admin.TwoFactorEnabled = secret.Valid && secret.String != ""
	return &admin, secret.String, lastStep, nil
}

// RecordPlatformLogin notes a completed superadmin sign-in (method: password,
// totp or recovery) in last_login_at, plus an admin.recovery_login audit row
// when a recovery code was spent.
func (s *SQLiteStore) RecordPlatformLogin(ctx context.Context, actor AuditActor, method string, at time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin record platform login: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE platform_admins SET last_login_at = ? WHERE id = ?`,
		at.UTC().Format(time.RFC3339), actor.AdminID,
	); err != nil {
		return fmt.Errorf("record platform login: %w", err)
	}
	// Ordinary sign-ins only update last_login_at (they would bury the log);
	// one that spends a recovery code is worth a row.
	if method == "recovery" {
		if err := writeAudit(ctx, tx, actor, auditEntry{
			action: domain.AuditAdminRecoveryLogin,
		}); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// maxAuditUsernameLength bounds an attempted (attacker-chosen) username kept
// in the log.
const maxAuditUsernameLength = 64

// RecordPlatformLoginFailure logs a failed superadmin sign-in. At the
// "password" stage username is as typed (it may not exist); at the "2fa" stage
// adminID identifies the account that passed the password step. Passwords and
// codes are never kept; the login limiter bounds how many rows this adds.
func (s *SQLiteStore) RecordPlatformLoginFailure(ctx context.Context, username, adminID, ip, stage string) error {
	var err error
	if adminID != "" {
		err = s.db.QueryRowContext(ctx, `SELECT username FROM platform_admins WHERE id = ?`, adminID).Scan(&username)
	} else {
		username = strings.TrimSpace(username)
		if utf8.RuneCountInString(username) > maxAuditUsernameLength {
			username = string([]rune(username)[:maxAuditUsernameLength]) + "…"
		}
		err = s.db.QueryRowContext(ctx, `SELECT id FROM platform_admins WHERE username = ?`, username).Scan(&adminID)
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("load platform admin: %w", err)
	}
	return writeAudit(ctx, s.db, AuditActor{AdminID: adminID, AdminUsername: username, IP: ip}, auditEntry{
		action: domain.AuditAdminLoginFailed,
		detail: map[string]string{"stage": stage},
	})
}

// ErrPlatformAdminNotFound reports an unknown superadmin account.
var ErrPlatformAdminNotFound = errors.New("platform admin not found")

const platformAdminSummarySelect = `
	SELECT id, username, created_at, last_login_at, totp_enabled_at, must_change_password, disabled_at
	FROM platform_admins`

func scanPlatformAdminSummary(row interface{ Scan(...any) error }) (domain.PlatformAdminSummary, error) {
	var admin domain.PlatformAdminSummary
	var lastLogin, totpEnabled, disabled sql.NullString
	err := row.Scan(&admin.ID, &admin.Username, &admin.CreatedAt, &lastLogin, &totpEnabled, &admin.MustChangePassword, &disabled)
	if lastLogin.Valid {
		admin.LastLoginAt = &lastLogin.String
	}
	if disabled.Valid {
		admin.DisabledAt = &disabled.String
	}
	admin.TwoFactorEnabled = totpEnabled.Valid
	return admin, err
}

// PlatformAdmins lists every superadmin account by username.
func (s *SQLiteStore) PlatformAdmins(ctx context.Context) ([]domain.PlatformAdminSummary, error) {
	rows, err := s.db.QueryContext(ctx, platformAdminSummarySelect+` ORDER BY username COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("list platform admins: %w", err)
	}
	defer rows.Close()
	admins := []domain.PlatformAdminSummary{}
	for rows.Next() {
		admin, err := scanPlatformAdminSummary(rows)
		if err != nil {
			return nil, fmt.Errorf("scan platform admin: %w", err)
		}
		admins = append(admins, admin)
	}
	return admins, rows.Err()
}

func (s *SQLiteStore) platformAdminSummary(ctx context.Context, id string) (*domain.PlatformAdminSummary, error) {
	admin, err := scanPlatformAdminSummary(s.db.QueryRowContext(ctx, platformAdminSummarySelect+` WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load platform admin: %w", err)
	}
	return &admin, nil
}

// PlatformCreateAdmin adds a superadmin with a temporary password: the account
// must change it at first sign-in (as the seeded default does).
func (s *SQLiteStore) PlatformCreateAdmin(ctx context.Context, actor AuditActor, input domain.PlatformCreateAdminInput) (*domain.PlatformAdminSummary, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return nil, newValidationError("Korisničko ime je obavezno.")
	}
	if utf8.RuneCountInString(username) > maxAuditUsernameLength {
		return nil, newValidationError(fmt.Sprintf("Korisničko ime može imati najviše %d znakova.", maxAuditUsernameLength))
	}
	if len(input.Password) < MinPlatformAdminPasswordLength {
		return nil, newValidationError(fmt.Sprintf("Lozinka mora imati najmanje %d znakova.", MinPlatformAdminPasswordLength))
	}
	if err := checkPasswordMaxLength(input.Password); err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	id := "platform-" + strings.ToLower(username)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create platform admin: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO platform_admins(id, username, password_hash, must_change_password, role) VALUES (?, ?, ?, 1, ?)`,
		id, username, string(hash), domain.PlatformRoleSuperadmin,
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError("Superadmin sa tim korisničkim imenom već postoji.")
		}
		return nil, fmt.Errorf("create platform admin: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action:         domain.AuditAdminCreate,
		targetUserID:   id,
		targetUsername: username,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create platform admin: %w", err)
	}
	return s.platformAdminSummary(ctx, id)
}

// PlatformSetAdminDisabled disables or re-enables a superadmin. Disabling ends
// the account's Backoffice sessions and every organization session it opened
// by impersonation. An admin cannot disable themselves, and the last enabled
// account cannot be disabled. nil when no such account; repeating the current
// state changes nothing and writes no audit row.
func (s *SQLiteStore) PlatformSetAdminDisabled(ctx context.Context, actor AuditActor, id string, disabled bool) (*domain.PlatformAdminSummary, error) {
	current, err := s.platformAdminSummary(ctx, id)
	if err != nil || current == nil {
		return nil, err
	}
	if (current.DisabledAt != nil) == disabled {
		return current, nil
	}
	if disabled && id == actor.AdminID {
		return nil, newValidationError("Ne možete onemogućiti sopstveni nalog.")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin disable platform admin: %w", err)
	}
	defer tx.Rollback()
	action := domain.AuditAdminEnable
	var disabledAt any
	if disabled {
		action = domain.AuditAdminDisable
		var others int
		if err := tx.QueryRowContext(
			ctx,
			`SELECT COUNT(*) FROM platform_admins WHERE disabled_at IS NULL AND id <> ?`,
			id,
		).Scan(&others); err != nil {
			return nil, fmt.Errorf("count platform admins: %w", err)
		}
		if others == 0 {
			return nil, newValidationError("Poslednji aktivni superadmin ne može biti onemogućen.")
		}
		now := time.Now().UTC().Format(time.RFC3339)
		disabledAt = now
		statements := []struct {
			sql  string
			args []any
		}{
			{`DELETE FROM platform_sessions WHERE admin_id = ?`, []any{id}},
			{`DELETE FROM platform_login_challenges WHERE admin_id = ?`, []any{id}},
			{
				`UPDATE impersonation_events SET ended_at = CASE WHEN expires_at < ? THEN expires_at ELSE ? END
				 WHERE ended_at IS NULL AND id IN (SELECT impersonation_id FROM sessions WHERE impersonation_id IS NOT NULL AND impersonated_by = ?)`,
				[]any{now, now, id},
			},
			{`DELETE FROM sessions WHERE impersonated_by = ?`, []any{id}},
		}
		for _, statement := range statements {
			if _, err := tx.ExecContext(ctx, statement.sql, statement.args...); err != nil {
				return nil, fmt.Errorf("end platform admin sessions: %w", err)
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE platform_admins SET disabled_at = ? WHERE id = ?`, disabledAt, id); err != nil {
		return nil, fmt.Errorf("disable platform admin: %w", err)
	}
	if err := writeAudit(ctx, tx, actor, auditEntry{
		action:         action,
		targetUserID:   id,
		targetUsername: current.Username,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit disable platform admin: %w", err)
	}
	return s.platformAdminSummary(ctx, id)
}

// platformSecurityMigration (v26) adds two-factor sign-in, account disabling
// and last sign-in to superadmins, the login challenge and recovery code
// tables, and the impersonation reason.
const platformSecurityMigration = `
ALTER TABLE platform_admins ADD COLUMN totp_secret TEXT;
ALTER TABLE platform_admins ADD COLUMN totp_pending_secret TEXT;
ALTER TABLE platform_admins ADD COLUMN totp_enabled_at TEXT;
ALTER TABLE platform_admins ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_admins ADD COLUMN disabled_at TEXT;
ALTER TABLE platform_admins ADD COLUMN last_login_at TEXT;

CREATE TABLE IF NOT EXISTS platform_recovery_codes (
	admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
	code_hash TEXT NOT NULL,
	used_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (admin_id, code_hash)
);

CREATE TABLE IF NOT EXISTS platform_login_challenges (
	token_hash TEXT PRIMARY KEY,
	admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_login_challenges_admin ON platform_login_challenges(admin_id);

ALTER TABLE impersonation_events ADD COLUMN reason TEXT NOT NULL DEFAULT ''
`
