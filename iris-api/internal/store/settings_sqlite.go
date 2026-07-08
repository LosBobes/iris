package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const (
	firmNameSettingKey     = "firm_name"
	pdfSectionsSettingKey  = "pdf_sections"
	proformaOnlySettingKey = "proforma_only"
)

// OrganizationSettings returns the shop-wide settings, falling back to defaults
// when a row is missing (e.g. a pre-migration database).
func (s *SQLiteStore) OrganizationSettings(ctx context.Context) (domain.OrganizationSettings, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.OrganizationSettings{}, err
	}
	settings := domain.OrganizationSettings{
		FirmName:     domain.DefaultFirmName,
		PDFSections:  domain.DefaultPDFSections(),
		ProformaOnly: domain.DefaultProformaOnly,
	}

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT key, value FROM app_settings WHERE tenant_id = ? AND key IN (?, ?, ?)`,
		tenantID,
		firmNameSettingKey,
		pdfSectionsSettingKey,
		proformaOnlySettingKey,
	)
	if err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("load organization settings: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return domain.OrganizationSettings{}, fmt.Errorf("scan organization settings: %w", err)
		}
		switch key {
		case firmNameSettingKey:
			if strings.TrimSpace(value) != "" {
				settings.FirmName = value
			}
		case pdfSectionsSettingKey:
			// Start from defaults so any field absent from stored JSON stays on.
			sections := domain.DefaultPDFSections()
			if err := json.Unmarshal([]byte(value), &sections); err == nil {
				settings.PDFSections = sections
			}
		case proformaOnlySettingKey:
			settings.ProformaOnly = value == "true"
		}
	}
	if err := rows.Err(); err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("iterate organization settings: %w", err)
	}
	return settings, nil
}

// UpdateOrganizationSettings merges the provided fields onto the current settings
// and persists them. Nil fields are left untouched.
func (s *SQLiteStore) UpdateOrganizationSettings(
	ctx context.Context,
	update domain.OrganizationSettingsUpdate,
) (domain.OrganizationSettings, error) {
	current, err := s.OrganizationSettings(ctx)
	if err != nil {
		return domain.OrganizationSettings{}, err
	}

	if update.FirmName != nil {
		firmName := strings.TrimSpace(*update.FirmName)
		if firmName == "" {
			return domain.OrganizationSettings{}, newValidationError("Naziv firme je obavezan.")
		}
		current.FirmName = firmName
	}
	if update.PDFSections != nil {
		current.PDFSections = *update.PDFSections
	}
	if update.ProformaOnly != nil {
		current.ProformaOnly = *update.ProformaOnly
	}

	sectionsJSON, err := json.Marshal(current.PDFSections)
	if err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("marshal pdf sections: %w", err)
	}

	if err := s.upsertSetting(ctx, firmNameSettingKey, current.FirmName); err != nil {
		return domain.OrganizationSettings{}, err
	}
	if err := s.upsertSetting(ctx, pdfSectionsSettingKey, string(sectionsJSON)); err != nil {
		return domain.OrganizationSettings{}, err
	}
	if err := s.upsertSetting(ctx, proformaOnlySettingKey, strconv.FormatBool(current.ProformaOnly)); err != nil {
		return domain.OrganizationSettings{}, err
	}
	return current, nil
}

func (s *SQLiteStore) upsertSetting(ctx context.Context, key, value string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO app_settings(tenant_id, key, value) VALUES (?, ?, ?)
		 ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value`,
		tenantID,
		key,
		value,
	); err != nil {
		return fmt.Errorf("update organization settings: %w", err)
	}
	return nil
}
