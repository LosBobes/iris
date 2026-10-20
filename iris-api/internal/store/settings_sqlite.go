package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const (
	firmNameSettingKey            = "firm_name"
	pdfSectionsSettingKey         = "pdf_sections"
	billingDefaultsSettingKey     = "billing_defaults"
	priorityDefaultsSettingKey    = "priority_defaults"
	printItemColumnsSettingKey    = "print_item_columns"
	showShippingOptionsSettingKey = "show_shipping_options"
	sellerIdentitySettingKey      = "seller_identity"
)

// OrganizationSettings returns the shop-wide settings, falling back to defaults
// when a row is missing (e.g. a pre-migration database). The shop settings
// come from the per-tenant cache; modules are always read fresh, so the
// settings a client sees never disagree with requireModule (which reads them
// uncached), even when another process (irisctl) switched a module.
func (s *SQLiteStore) OrganizationSettings(ctx context.Context) (domain.OrganizationSettings, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.OrganizationSettings{}, err
	}
	settings, ok := s.caches.settings.get(tenantID)
	if ok {
		settings = cloneSettings(settings)
	} else {
		gen := s.caches.settings.generation(tenantID)
		settings, err = loadOrganizationSettings(ctx, s.db, tenantID)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		s.caches.settings.put(tenantID, gen, cloneSettings(settings))
	}
	modules, err := readModules(ctx, s.db, tenantID)
	if err != nil {
		return domain.OrganizationSettings{}, err
	}
	settings.Modules = modules
	return settings, nil
}

func loadOrganizationSettings(ctx context.Context, q dbExecQuerier, tenantID string) (domain.OrganizationSettings, error) {
	settings := domain.OrganizationSettings{
		PDFSections:         domain.DefaultPDFSections(),
		BillingDefaults:     domain.DefaultBillingDefaults(),
		PriorityDefaults:    domain.DefaultPriorityDefaults(),
		PrintItemColumns:    domain.DefaultPrintItemColumns(),
		ShowShippingOptions: false,
	}

	rows, err := q.QueryContext(
		ctx,
		`SELECT key, value FROM app_settings WHERE tenant_id = ? AND key IN (?, ?, ?, ?, ?, ?, ?, ?)`,
		tenantID,
		firmNameSettingKey,
		pdfSectionsSettingKey,
		billingDefaultsSettingKey,
		priorityDefaultsSettingKey,
		printItemColumnsSettingKey,
		showShippingOptionsSettingKey,
		sellerIdentitySettingKey,
		modulesSettingKey,
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
		case billingDefaultsSettingKey:
			// Start from defaults so an absent field keeps its default value.
			defaults := domain.DefaultBillingDefaults()
			if err := json.Unmarshal([]byte(value), &defaults); err == nil {
				settings.BillingDefaults = defaults
			}
		case priorityDefaultsSettingKey:
			// Start from defaults so an absent field keeps its default value.
			defaults := domain.DefaultPriorityDefaults()
			if err := json.Unmarshal([]byte(value), &defaults); err == nil {
				settings.PriorityDefaults = defaults
			}
		case printItemColumnsSettingKey:
			// A stored order that no longer parses, or that predates a column
			// rename, falls back to the default rather than dropping a column.
			var columns []domain.PrintItemColumn
			if err := json.Unmarshal([]byte(value), &columns); err == nil {
				if normalized, err := normalizePrintItemColumns(columns); err == nil {
					settings.PrintItemColumns = normalized
				}
			}
		case showShippingOptionsSettingKey:
			if parsed, err := strconv.ParseBool(value); err == nil {
				settings.ShowShippingOptions = parsed
			}
		case sellerIdentitySettingKey:
			var identity domain.SellerIdentity
			if err := json.Unmarshal([]byte(value), &identity); err == nil {
				settings.SellerIdentity = &identity
			}
		case modulesSettingKey:
			settings.Modules = parseModules(value)
		}
	}
	if err := rows.Err(); err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("iterate organization settings: %w", err)
	}
	if settings.FirmName == "" {
		// No firm name saved yet: show the organization's own name rather than
		// a generic placeholder.
		var tenantName string
		err := q.QueryRowContext(ctx, `SELECT name FROM tenants WHERE id = ?`, tenantID).Scan(&tenantName)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return domain.OrganizationSettings{}, fmt.Errorf("load tenant name: %w", err)
		}
		settings.FirmName = strings.TrimSpace(tenantName)
		if settings.FirmName == "" {
			settings.FirmName = domain.DefaultFirmName
		}
	}
	return settings, nil
}

// UpdateOrganizationSettings merges the provided fields onto the current settings
// and persists them. Nil fields are left untouched. The merge starts from a
// fresh read inside the write transaction (never the cache), and only the keys
// the update sets are written, so a concurrent change to another key survives.
func (s *SQLiteStore) UpdateOrganizationSettings(
	ctx context.Context,
	update domain.OrganizationSettingsUpdate,
) (domain.OrganizationSettings, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.OrganizationSettings{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("begin update organization settings: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	current, err := loadOrganizationSettings(ctx, tx, tenantID)
	if err != nil {
		return domain.OrganizationSettings{}, err
	}

	writes := map[string]string{}
	if update.FirmName != nil {
		firmName := strings.TrimSpace(*update.FirmName)
		if firmName == "" {
			return domain.OrganizationSettings{}, newValidationError("Naziv firme je obavezan.")
		}
		current.FirmName = firmName
		writes[firmNameSettingKey] = firmName
	}
	if update.PDFSections != nil {
		current.PDFSections = *update.PDFSections
		encoded, err := json.Marshal(current.PDFSections)
		if err != nil {
			return domain.OrganizationSettings{}, fmt.Errorf("marshal pdf sections: %w", err)
		}
		writes[pdfSectionsSettingKey] = string(encoded)
	}
	if update.BillingDefaults != nil {
		defaults, err := normalizeBillingDefaults(*update.BillingDefaults)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		current.BillingDefaults = defaults
		encoded, err := json.Marshal(defaults)
		if err != nil {
			return domain.OrganizationSettings{}, fmt.Errorf("marshal billing defaults: %w", err)
		}
		writes[billingDefaultsSettingKey] = string(encoded)
	}
	if update.PriorityDefaults != nil {
		defaults, err := normalizePriorityDefaults(*update.PriorityDefaults)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		current.PriorityDefaults = defaults
		encoded, err := json.Marshal(defaults)
		if err != nil {
			return domain.OrganizationSettings{}, fmt.Errorf("marshal priority defaults: %w", err)
		}
		writes[priorityDefaultsSettingKey] = string(encoded)
	}
	if update.PrintItemColumns != nil {
		columns, err := normalizePrintItemColumns(*update.PrintItemColumns)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		current.PrintItemColumns = columns
		encoded, err := json.Marshal(columns)
		if err != nil {
			return domain.OrganizationSettings{}, fmt.Errorf("marshal print item columns: %w", err)
		}
		writes[printItemColumnsSettingKey] = string(encoded)
	}
	if update.ShowShippingOptions != nil {
		current.ShowShippingOptions = *update.ShowShippingOptions
		writes[showShippingOptionsSettingKey] = strconv.FormatBool(current.ShowShippingOptions)
	}
	if update.SellerIdentity != nil {
		identity, err := normalizeSellerIdentity(*update.SellerIdentity)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		current.SellerIdentity = &identity
		encoded, err := json.Marshal(identity)
		if err != nil {
			return domain.OrganizationSettings{}, fmt.Errorf("marshal seller identity: %w", err)
		}
		writes[sellerIdentitySettingKey] = string(encoded)
	}

	for key, value := range writes {
		if err := upsertSettingTx(ctx, tx, tenantID, key, value); err != nil {
			return domain.OrganizationSettings{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return domain.OrganizationSettings{}, fmt.Errorf("commit organization settings: %w", err)
	}
	s.invalidateSettings(tenantID)
	return current, nil
}

// normalizeBillingDefaults validates and fills the document-type default. An
// empty document type falls back to the shop default (proforma); an unknown one
// is rejected so the clients never receive a value they can't render.
func normalizeBillingDefaults(defaults domain.BillingDefaults) (domain.BillingDefaults, error) {
	if defaults.DocumentType == "" {
		defaults.DocumentType = domain.DefaultBillingDocumentType
	}
	switch defaults.DocumentType {
	case domain.BillingDocumentTypeInvoice,
		domain.BillingDocumentTypeCashCollection,
		domain.BillingDocumentTypeProforma:
	default:
		return domain.BillingDefaults{}, newValidationError("Nepoznat tip dokumenta.")
	}
	return defaults, nil
}

// normalizePriorityDefaults validates and fills the priority default. An empty
// priority falls back to the shop default (normal); an unknown one is rejected so
// the clients never receive a value they can't render.
func normalizePriorityDefaults(defaults domain.PriorityDefaults) (domain.PriorityDefaults, error) {
	if defaults.Priority == "" {
		defaults.Priority = domain.DefaultWorkOrderPriority
	}
	switch defaults.Priority {
	case domain.WorkOrderPriorityLow,
		domain.WorkOrderPriorityNormal,
		domain.WorkOrderPriorityHigh,
		domain.WorkOrderPriorityUrgent:
	default:
		return domain.PriorityDefaults{}, newValidationError("Nepoznat prioritet.")
	}
	return defaults, nil
}

// normalizePrintItemColumns validates the printout's line-item column order. An
// empty list falls back to the shop default; anything else must be an exact
// permutation of the three known columns, so the printout can never silently
// lose or duplicate a column.
func normalizePrintItemColumns(columns []domain.PrintItemColumn) ([]domain.PrintItemColumn, error) {
	if len(columns) == 0 {
		return domain.DefaultPrintItemColumns(), nil
	}
	seen := make(map[domain.PrintItemColumn]bool, len(columns))
	for _, column := range columns {
		switch column {
		case domain.PrintItemColumnQuantity,
			domain.PrintItemColumnUnitPrice,
			domain.PrintItemColumnTotal:
		default:
			return nil, newValidationError("Nepoznata kolona stavki.")
		}
		if seen[column] {
			return nil, newValidationError("Kolona stavki je navedena više puta.")
		}
		seen[column] = true
	}
	if len(seen) != len(domain.DefaultPrintItemColumns()) {
		return nil, newValidationError("Redosled kolona mora sadržati sve kolone stavki.")
	}
	return append([]domain.PrintItemColumn(nil), columns...), nil
}

func (s *SQLiteStore) upsertSetting(ctx context.Context, key, value string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if err := upsertSettingTx(ctx, s.db, tenantID, key, value); err != nil {
		return err
	}
	s.invalidateSettings(tenantID)
	return nil
}

func upsertSettingTx(ctx context.Context, q dbExecQuerier, tenantID, key, value string) error {
	if _, err := q.ExecContext(
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
