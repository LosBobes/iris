package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

// ListUsers returns all accounts (id, username, role) ordered by username. The
// password hash is never exposed.
func (s *SQLiteStore) ListUsers(ctx context.Context) ([]domain.User, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, username, role, tenant_id FROM users WHERE tenant_id = ? ORDER BY username COLLATE NOCASE`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		var user domain.User
		var role string
		if err := rows.Scan(&user.ID, &user.Username, &role, &user.TenantID); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		user.Role = domain.UserRole(role)
		users = append(users, user)
	}
	return users, rows.Err()
}

// UserByID returns a single account or nil when no row matches within the tenant.
func (s *SQLiteStore) UserByID(ctx context.Context, id string) (*domain.User, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	var user domain.User
	var role string
	err = s.db.QueryRowContext(
		ctx,
		`SELECT id, username, role, tenant_id FROM users WHERE id = ? AND tenant_id = ?`,
		id,
		tenantID,
	).Scan(&user.ID, &user.Username, &role, &user.TenantID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	user.Role = domain.UserRole(role)
	return &user, nil
}

// CreateUserAccount adds a new account, hashing the password. A duplicate
// username is reported as a validation error.
func (s *SQLiteStore) CreateUserAccount(
	ctx context.Context,
	input domain.CreateUserInput,
) (*domain.User, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return nil, newValidationError("Korisničko ime je obavezno.")
	}
	if err := validateUserRole(input.Role); err != nil {
		return nil, err
	}
	if err := validateUserPassword(input.Password); err != nil {
		return nil, err
	}
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	id, err := newUserID()
	if err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO users(id, tenant_id, username, password_hash, role, is_demo, updated_at)
		 VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
		id, tenantID, username, string(hash), string(input.Role),
	); err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError("Korisničko ime već postoji.")
		}
		return nil, fmt.Errorf("create user account: %w", err)
	}
	return &domain.User{ID: id, Username: username, Role: input.Role, TenantID: tenantID}, nil
}

// UpdateUserAccount changes a user's role and, when a password is supplied,
// resets it. Returns nil when the id does not exist.
func (s *SQLiteStore) UpdateUserAccount(
	ctx context.Context,
	id string,
	input domain.UpdateUserInput,
) (*domain.User, error) {
	existing, err := s.UserByID(ctx, id)
	if err != nil || existing == nil {
		return existing, err
	}
	if err := validateUserRole(input.Role); err != nil {
		return nil, err
	}

	if strings.TrimSpace(input.Password) != "" {
		if err := validateUserPassword(input.Password); err != nil {
			return nil, err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		if _, err := s.db.ExecContext(
			ctx,
			`UPDATE users SET role = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
			string(input.Role), string(hash), id, existing.TenantID,
		); err != nil {
			return nil, fmt.Errorf("update user account: %w", err)
		}
	} else if _, err := s.db.ExecContext(
		ctx,
		`UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
		string(input.Role), id, existing.TenantID,
	); err != nil {
		return nil, fmt.Errorf("update user role: %w", err)
	}

	existing.Role = input.Role
	return existing, nil
}

// DeleteUser removes an account by id.
func (s *SQLiteStore) DeleteUser(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	return nil
}
