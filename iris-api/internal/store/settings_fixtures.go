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
	if update.ProformaOnly != nil {
		current.ProformaOnly = *update.ProformaOnly
	}

	s.firmName = current.FirmName
	sections := current.PDFSections
	s.pdfSections = &sections
	proformaOnly := current.ProformaOnly
	s.proformaOnly = &proformaOnly
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
	proformaOnly := domain.DefaultProformaOnly
	if s.proformaOnly != nil {
		proformaOnly = *s.proformaOnly
	}
	return domain.OrganizationSettings{FirmName: firmName, PDFSections: sections, ProformaOnly: proformaOnly}
}
