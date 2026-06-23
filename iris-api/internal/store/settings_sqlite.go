package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const firmNameSettingKey = "firm_name"

// OrganizationSettings returns the shop-wide settings, falling back to the
// default firm name when the row is missing (e.g. a pre-migration database).
func (s *SQLiteStore) OrganizationSettings(ctx context.Context) (domain.OrganizationSettings, error) {
	var firmName string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT value FROM app_settings WHERE key = ?`,
		firmNameSettingKey,
	).Scan(&firmName)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.OrganizationSettings{FirmName: domain.DefaultFirmName}, nil
	}
	if err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("load organization settings: %w", err)
	}
	return domain.OrganizationSettings{FirmName: firmName}, nil
}

// UpdateOrganizationSettings validates and persists the firm name.
func (s *SQLiteStore) UpdateOrganizationSettings(
	ctx context.Context,
	settings domain.OrganizationSettings,
) (domain.OrganizationSettings, error) {
	firmName := strings.TrimSpace(settings.FirmName)
	if firmName == "" {
		return domain.OrganizationSettings{}, newValidationError("Naziv firme je obavezan.")
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO app_settings(key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		firmNameSettingKey,
		firmName,
	); err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("update organization settings: %w", err)
	}
	return domain.OrganizationSettings{FirmName: firmName}, nil
}
