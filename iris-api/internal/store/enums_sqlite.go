package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// isUniqueConstraintError reports whether err is a SQLite UNIQUE constraint
// violation. modernc.org/sqlite surfaces these via the error message.
func isUniqueConstraintError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// customEnums loads the admin-created values into a fast lookup set used during
// work-order validation.
func (s *SQLiteStore) customEnums(ctx context.Context) (customEnumSet, error) {
	values, err := s.listCustomEnumValues(ctx)
	if err != nil {
		return nil, err
	}
	return customEnumSetFromValues(values), nil
}

// EnumValues returns the built-in defaults merged with admin-created values.
func (s *SQLiteStore) EnumValues(ctx context.Context) ([]domain.EnumValue, error) {
	custom, err := s.listCustomEnumValues(ctx)
	if err != nil {
		return nil, err
	}
	return mergeEnumValues(custom), nil
}

func (s *SQLiteStore) listCustomEnumValues(ctx context.Context) ([]domain.EnumValue, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, field, value, label, sort_order, created_at, updated_at
		 FROM enum_values WHERE tenant_id = ? ORDER BY field, sort_order, label`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("list enum values: %w", err)
	}
	defer rows.Close()

	values := make([]domain.EnumValue, 0)
	for rows.Next() {
		var value domain.EnumValue
		if err := rows.Scan(
			&value.ID,
			&value.Field,
			&value.Value,
			&value.Label,
			&value.SortOrder,
			&value.CreatedAt,
			&value.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan enum value: %w", err)
		}
		value.IsBuiltin = false
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate enum values: %w", err)
	}
	return values, nil
}

// CreateEnumValue stores a new custom value for a managed field.
func (s *SQLiteStore) CreateEnumValue(
	ctx context.Context,
	input domain.EnumValueInput,
) (*domain.EnumValue, error) {
	input = normalizeEnumValueInput(input)
	if err := validateEnumValueInput(input); err != nil {
		return nil, err
	}
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}

	id, err := newEnumID()
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO enum_values(id, tenant_id, field, value, label, sort_order, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, tenantID, string(input.Field), input.Value, input.Label, input.SortOrder, now, now,
	)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError("Vrednost sa istom šifrom već postoji.")
		}
		return nil, fmt.Errorf("create enum value: %w", err)
	}

	return &domain.EnumValue{
		ID:        id,
		Field:     input.Field,
		Value:     input.Value,
		Label:     input.Label,
		SortOrder: input.SortOrder,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// UpdateEnumValue edits an existing custom value.
func (s *SQLiteStore) UpdateEnumValue(
	ctx context.Context,
	id string,
	input domain.EnumValueInput,
) (*domain.EnumValue, error) {
	input = normalizeEnumValueInput(input)
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}

	var field domain.EnumField
	var createdAt string
	err = s.db.QueryRowContext(
		ctx,
		`SELECT field, created_at FROM enum_values WHERE id = ? AND tenant_id = ?`,
		id,
		tenantID,
	).Scan(&field, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load enum value: %w", err)
	}

	candidate := domain.EnumValueInput{
		Field:     field,
		Value:     input.Value,
		Label:     input.Label,
		SortOrder: input.SortOrder,
	}
	if err := validateEnumValueInput(candidate); err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.ExecContext(
		ctx,
		`UPDATE enum_values SET value = ?, label = ?, sort_order = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
		candidate.Value, candidate.Label, candidate.SortOrder, now, id, tenantID,
	)
	if err != nil {
		if isUniqueConstraintError(err) {
			return nil, newValidationError("Vrednost sa istom šifrom već postoji.")
		}
		return nil, fmt.Errorf("update enum value: %w", err)
	}

	return &domain.EnumValue{
		ID:        id,
		Field:     field,
		Value:     candidate.Value,
		Label:     candidate.Label,
		SortOrder: candidate.SortOrder,
		CreatedAt: createdAt,
		UpdatedAt: now,
	}, nil
}

// DeleteEnumValue removes a custom value by id.
func (s *SQLiteStore) DeleteEnumValue(ctx context.Context, id string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM enum_values WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return fmt.Errorf("delete enum value: %w", err)
	}
	return nil
}

func newEnumID() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("create enum id: %w", err)
	}
	return "enum-" + hex.EncodeToString(raw[:]), nil
}
