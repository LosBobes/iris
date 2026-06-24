package store

import (
	"context"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// OrganizationSettings returns the in-memory firm name, defaulting when unset.
func (s *FixtureStore) OrganizationSettings(_ context.Context) (domain.OrganizationSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	firmName := s.firmName
	if firmName == "" {
		firmName = domain.DefaultFirmName
	}
	return domain.OrganizationSettings{FirmName: firmName}, nil
}

// UpdateOrganizationSettings validates and stores the firm name in memory.
func (s *FixtureStore) UpdateOrganizationSettings(
	_ context.Context,
	settings domain.OrganizationSettings,
) (domain.OrganizationSettings, error) {
	firmName := strings.TrimSpace(settings.FirmName)
	if firmName == "" {
		return domain.OrganizationSettings{}, newValidationError("Naziv firme je obavezan.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.firmName = firmName
	return domain.OrganizationSettings{FirmName: firmName}, nil
}
