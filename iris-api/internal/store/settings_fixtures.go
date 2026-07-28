package store

import (
	"context"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// OrganizationSettings returns the in-memory settings, defaulting when unset.
func (s *FixtureStore) OrganizationSettings(_ context.Context) (domain.OrganizationSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.organizationSettingsLocked(), nil
}

// UpdateOrganizationSettings merges the provided fields onto the current settings
// and stores them in memory. Nil fields are left untouched.
func (s *FixtureStore) UpdateOrganizationSettings(
	_ context.Context,
	update domain.OrganizationSettingsUpdate,
) (domain.OrganizationSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current := s.organizationSettingsLocked()

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
	if update.BillingDefaults != nil {
		defaults, err := normalizeBillingDefaults(*update.BillingDefaults)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		current.BillingDefaults = defaults
	}
	if update.PriorityDefaults != nil {
		defaults, err := normalizePriorityDefaults(*update.PriorityDefaults)
		if err != nil {
			return domain.OrganizationSettings{}, err
		}
		current.PriorityDefaults = defaults
	}
	if update.ShowShippingOptions != nil {
		current.ShowShippingOptions = *update.ShowShippingOptions
	}
	if update.AllowMultipleLocations != nil {
		current.AllowMultipleLocations = *update.AllowMultipleLocations
	}

	s.firmName = current.FirmName
	sections := current.PDFSections
	s.pdfSections = &sections
	billingDefaults := current.BillingDefaults
	s.billingDefaults = &billingDefaults
	priorityDefaults := current.PriorityDefaults
	s.priorityDefaults = &priorityDefaults
	showShippingOptions := current.ShowShippingOptions
	s.showShippingOptions = &showShippingOptions
	allowMultipleLocations := current.AllowMultipleLocations
	s.allowMultipleLocations = &allowMultipleLocations
	return current, nil
}

func (s *FixtureStore) organizationSettingsLocked() domain.OrganizationSettings {
	firmName := s.firmName
	if firmName == "" {
		firmName = domain.DefaultFirmName
	}
	sections := domain.DefaultPDFSections()
	if s.pdfSections != nil {
		sections = *s.pdfSections
	}
	billingDefaults := domain.DefaultBillingDefaults()
	if s.billingDefaults != nil {
		billingDefaults = *s.billingDefaults
	}
	priorityDefaults := domain.DefaultPriorityDefaults()
	if s.priorityDefaults != nil {
		priorityDefaults = *s.priorityDefaults
	}
	showShippingOptions := false
	if s.showShippingOptions != nil {
		showShippingOptions = *s.showShippingOptions
	}
	allowMultipleLocations := domain.DefaultAllowMultipleLocations
	if s.allowMultipleLocations != nil {
		allowMultipleLocations = *s.allowMultipleLocations
	}
	return domain.OrganizationSettings{
		FirmName:               firmName,
		PDFSections:            sections,
		BillingDefaults:        billingDefaults,
		PriorityDefaults:       priorityDefaults,
		ShowShippingOptions:    showShippingOptions,
		AllowMultipleLocations: allowMultipleLocations,
	}
}
