package store

import (
	"context"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// scenarioFirmNameFallsBackToTenantName runs on both engines (see
// storeScenarios): an organization without a saved firm name shows its own
// name, follows a rename, and a saved firm name wins.
func scenarioFirmNameFallsBackToTenantName(t *testing.T, ctx context.Context, s *SQLStore) {
	actor := AuditActor{AdminID: "platform-1", AdminUsername: "ops", IP: "127.0.0.1"}
	tenant, err := s.PlatformCreateTenant(ctx, actor, domain.PlatformCreateTenantInput{
		Name: "Stolarija Novak", Slug: "stolarija-novak", AdminUsername: "sef", AdminPassword: "lozinka123",
	})
	if err != nil {
		t.Fatal(err)
	}
	tenantCtx := ContextWithTenant(context.Background(), tenant.ID)

	settings, err := s.OrganizationSettings(tenantCtx)
	if err != nil {
		t.Fatal(err)
	}
	if settings.FirmName != "Stolarija Novak" {
		t.Fatalf("firmName = %q, want the tenant name", settings.FirmName)
	}

	renamed := "Stolarija Novak i sinovi"
	if _, err := s.PlatformUpdateTenant(ctx, actor, "stolarija-novak", domain.PlatformUpdateTenantInput{Name: &renamed}); err != nil {
		t.Fatal(err)
	}
	if settings, err = s.OrganizationSettings(tenantCtx); err != nil {
		t.Fatal(err)
	}
	if settings.FirmName != renamed {
		t.Fatalf("firmName after rename = %q, want %q", settings.FirmName, renamed)
	}

	saved := "Novak d.o.o."
	if settings, err = s.UpdateOrganizationSettings(tenantCtx, domain.OrganizationSettingsUpdate{FirmName: &saved}); err != nil {
		t.Fatal(err)
	}
	if settings.FirmName != saved {
		t.Fatalf("firmName after save = %q, want %q", settings.FirmName, saved)
	}
}
